import assert from "node:assert/strict";
import test from "node:test";

import {
  CORRALIO_REFRESH_BATCH_LIMIT,
  runCorralioScheduledRefresh,
  type CorralioRefreshClaim,
  type CorralioRefreshFailureCode,
  type CorralioRefreshStore,
} from "./refresh";

function claim(index: number): CorralioRefreshClaim {
  return {
    sourceId: `source-${index}`,
    householdId: `household-${index}`,
    sourceUrl: `https://calendar.example/${index}.ics?token=private-${index}`,
    claimToken: `claim-${index}`,
  };
}

function memoryStore(claims: CorralioRefreshClaim[]) {
  const persisted: string[] = [];
  const failures: Array<{ sourceId: string; failureCode: CorralioRefreshFailureCode }> = [];
  let requestedLimit = 0;
  const store: CorralioRefreshStore = {
    async claimBatch(limit) {
      requestedLimit = limit;
      return claims.slice(0, limit);
    },
    async persistClaimed(input) {
      persisted.push(input.sourceId);
    },
    async failClaimed(input) {
      failures.push({ sourceId: input.sourceId, failureCode: input.failureCode });
    },
  };
  return { store, persisted, failures, requestedLimit: () => requestedLimit };
}

const normalizedEvent = {
  title: "Game",
  startsAt: "2026-08-22T17:00:00.000Z",
  endsAt: null,
  timezone: null,
  notes: null,
  rawLocation: "Sports Park",
  location: "Sports Park",
  fieldLabel: null,
  sourceEventUid: "game-1",
};

test("claims at most 10 sources and reports a full batch without a count query", async () => {
  const state = memoryStore(Array.from({ length: 12 }, (_, index) => claim(index)));
  const result = await runCorralioScheduledRefresh(state.store, {
    fetchSchedule: async (url) => ({ ok: true, text: "calendar", finalUrl: String(url) }),
    normalizeSchedule: () => ({ events: [normalizedEvent], canceledSourceEventUids: [], errors: [], parsedTotal: 1 }),
    nowMs: () => 100,
  });
  assert.equal(state.requestedLimit(), CORRALIO_REFRESH_BATCH_LIMIT);
  assert.equal(result.claimed, 10);
  assert.equal(result.batch_full, true);
  assert.equal(state.persisted.length, 10);
});

test("batch_full is false when fewer than 10 sources are claimed", async () => {
  const state = memoryStore([claim(1)]);
  const result = await runCorralioScheduledRefresh(state.store, {
    fetchSchedule: async (url) => ({ ok: true, text: "calendar", finalUrl: String(url) }),
    normalizeSchedule: () => ({ events: [normalizedEvent], canceledSourceEventUids: [], errors: [], parsedTotal: 1 }),
    nowMs: () => 100,
  });
  assert.equal(result.claimed, 1);
  assert.equal(result.batch_full, false);
});

test("one feed failure is sanitized, finalized, and does not block later sources", async () => {
  const state = memoryStore([claim(1), claim(2)]);
  const result = await runCorralioScheduledRefresh(state.store, {
    fetchSchedule: async (url) => String(url).includes("/1.ics")
      ? { ok: false, error: "private_url" }
      : { ok: true, text: "calendar", finalUrl: String(url) },
    normalizeSchedule: () => ({ events: [normalizedEvent], canceledSourceEventUids: [], errors: [], parsedTotal: 1 }),
    nowMs: () => 100,
  });
  assert.equal(result.failed, 1);
  assert.equal(result.refreshed, 1);
  assert.deepEqual(state.persisted, ["source-2"]);
  assert.deepEqual(state.failures, [{ sourceId: "source-1", failureCode: "private_url" }]);
  assert.doesNotMatch(JSON.stringify(result), /private-|calendar\.example|token=/);
});

test("a valid empty feed delegates safely to canonical persistence", async () => {
  const state = memoryStore([claim(1)]);
  const result = await runCorralioScheduledRefresh(state.store, {
    fetchSchedule: async (url) => ({ ok: true, text: "calendar", finalUrl: String(url) }),
    normalizeSchedule: () => ({ events: [], canceledSourceEventUids: ["canceled-1"], errors: [], parsedTotal: 0 }),
    nowMs: () => 100,
  });
  assert.equal(result.valid_empty, 1);
  assert.deepEqual(state.persisted, ["source-1"]);
  assert.deepEqual(state.failures, []);
});

test("processing is sequential and never creates unbounded fetch concurrency", async () => {
  const state = memoryStore([claim(1), claim(2), claim(3)]);
  let active = 0;
  let maximumActive = 0;
  await runCorralioScheduledRefresh(state.store, {
    fetchSchedule: async (url) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return { ok: true, text: "calendar", finalUrl: String(url) };
    },
    normalizeSchedule: () => ({ events: [normalizedEvent], canceledSourceEventUids: [], errors: [], parsedTotal: 1 }),
  });
  assert.equal(maximumActive, 1);
});
