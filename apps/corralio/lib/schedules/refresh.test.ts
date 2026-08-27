import assert from "node:assert/strict";
import test from "node:test";

import {
  CORRALIO_REFRESH_BATCH_LIMIT,
  CORRALIO_MANUAL_REFRESH_COOLDOWN_MINUTES,
  CORRALIO_REFRESH_FAILURE_MINIMUM_HOURS,
  CORRALIO_REFRESH_FAILURE_THRESHOLD,
  CORRALIO_REFRESH_FRESHNESS_HOURS,
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
  const matchingCalls: string[] = [];
  let matchingFailure = false;
  let requestedLimit = 0;
  const store: CorralioRefreshStore = {
    async claimBatch(limit) {
      requestedLimit = limit;
      return claims.slice(0, limit);
    },
    async persistClaimed(input) {
      persisted.push(input.sourceId);
    },
    async matchPersistedEvents(input) {
      matchingCalls.push(input.sourceId);
      if (matchingFailure) throw new Error("synthetic matcher failure");
    },
    async failClaimed(input) {
      failures.push({ sourceId: input.sourceId, failureCode: input.failureCode });
      return true;
    },
  };
  return {
    store,
    persisted,
    failures,
    matchingCalls,
    failMatching() { matchingFailure = true; },
    requestedLimit: () => requestedLimit,
  };
}

const normalizedEvent = {
  title: "Game",
  startsAt: "2026-08-22T17:00:00.000Z",
  endsAt: null,
  timezone: null,
  notes: null,
  scheduleArrivalAt: null,
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

test("a stale claim finalization is skipped instead of counted as a persisted failure", async () => {
  const state = memoryStore([claim(1)]);
  state.store.failClaimed = async () => false;
  const result = await runCorralioScheduledRefresh(state.store, {
    fetchSchedule: async () => ({ ok: false, error: "fetch_failed" }),
    nowMs: () => 100,
  });
  assert.equal(result.failed, 0);
  assert.equal(result.skipped, 1);
});

test("persistent failure threshold remains fixed at three", () => {
  assert.equal(CORRALIO_REFRESH_FAILURE_THRESHOLD, 3);
  assert.equal(CORRALIO_REFRESH_FAILURE_MINIMUM_HOURS, 24);
  assert.equal(CORRALIO_REFRESH_FRESHNESS_HOURS, 3);
  assert.equal(CORRALIO_MANUAL_REFRESH_COOLDOWN_MINUTES, 5);
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

test("venue matching failure after refresh persistence never changes source health", async () => {
  const state = memoryStore([claim(1)]);
  state.failMatching();
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    const result = await runCorralioScheduledRefresh(state.store, {
      fetchSchedule: async (url) => ({ ok: true, text: "calendar", finalUrl: String(url) }),
      normalizeSchedule: () => ({ events: [normalizedEvent], canceledSourceEventUids: [], errors: [], parsedTotal: 1 }),
      nowMs: () => 100,
    });
    assert.equal(result.refreshed, 1);
    assert.equal(result.failed, 0);
    assert.deepEqual(state.persisted, ["source-1"]);
    assert.deepEqual(state.matchingCalls, ["source-1"]);
    assert.deepEqual(state.failures, []);
    assert.deepEqual(warnings, [["[corralio][venue-matching] post-persistence evaluation failed"]]);
  } finally {
    console.warn = originalWarn;
  }
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
