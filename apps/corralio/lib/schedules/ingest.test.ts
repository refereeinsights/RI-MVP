import assert from "node:assert/strict";
import test from "node:test";

import {
  ingestCorralioSchedule,
  replaceCorralioSchedule,
  type CorralioScheduleStore,
  type PersistedScheduleEvent,
} from "./ingest";
import type { CorralioSport } from "./sport";

const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:game-1",
  "DTSTART:20260822T170000Z",
  "DTEND:20260822T190000Z",
  "SUMMARY:Saturday Game",
  "LOCATION:Regional Sports Park, Field 6",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\n");

function memoryStore(householdId = "household-a") {
  const sources = new Map<string, string>();
  const sourceUrls = new Map<string, string>();
  const sourceSports = new Map<string, CorralioSport | null>();
  const events = new Map<string, PersistedScheduleEvent>();
  const calls: Array<{ householdId: string; sourceId: string }> = [];
  const store: CorralioScheduleStore = {
    async resolveOwnerContext() {
      return { userId: "user-a", householdId };
    },
    async findSourceByUrl(requestedHouseholdId, url) {
      assert.equal(requestedHouseholdId, householdId);
      return sources.get(url) ?? null;
    },
    async createSource(input) {
      assert.equal(input.householdId, householdId);
      const id = `source-${sources.size + 1}`;
      sources.set(input.sourceUrl, id);
      sourceUrls.set(id, input.sourceUrl);
      sourceSports.set(id, input.sport);
      return id;
    },
    async updateSourceSport(sourceId, sport) {
      sourceSports.set(sourceId, sport);
    },
    async persistIngestion(input) {
      assert.equal(input.householdId, householdId);
      calls.push({ householdId: input.householdId, sourceId: input.sourceId });
      for (const event of input.events) events.set(`${input.sourceId}:${event.source_event_uid}`, event);
      for (const uid of input.canceledSourceEventUids) events.delete(`${input.sourceId}:${uid}`);
    },
    async replaceSourceAndPersist(input) {
      sourceUrls.set(input.sourceId, input.sourceUrl);
      calls.push({ householdId: input.householdId, sourceId: input.sourceId });
      for (const event of input.events) events.set(`${input.sourceId}:${event.source_event_uid}`, event);
      for (const uid of input.canceledSourceEventUids) events.delete(`${input.sourceId}:${uid}`);
    },
    async markSourceError() {},
  };
  return { store, sources, sourceUrls, sourceSports, events, calls };
}

const fetchSuccess = async () => ({
  ok: true as const,
  text: ICS,
  finalUrl: "https://calendar.example/team.ics",
});

test("an authenticated owner imports shared-engine events into only the resolved household", async () => {
  const state = memoryStore();
  const result = await ingestCorralioSchedule(
    state.store,
    { sourceUrl: "webcal://calendar.example/team.ics", displayName: "Falcons", sport: "soccer" },
    { fetchSchedule: fetchSuccess },
  );
  assert.deepEqual(result, { ok: true, sourceId: "source-1", imported: 1 });
  assert.deepEqual(state.calls, [{ householdId: "household-a", sourceId: "source-1" }]);
  assert.equal(state.events.size, 1);
  assert.equal(state.sourceSports.get("source-1"), "soccer");
  assert.equal([...state.events.values()][0]?.source_location_text, "Regional Sports Park, Field 6");
});

test("re-import reuses the source and stable event identity instead of duplicating", async () => {
  const state = memoryStore();
  const input = { sourceUrl: "https://calendar.example/team.ics" };
  await ingestCorralioSchedule(state.store, input, { fetchSchedule: fetchSuccess });
  await ingestCorralioSchedule(state.store, input, { fetchSchedule: fetchSuccess });
  assert.equal(state.sources.size, 1);
  assert.equal(state.events.size, 1);
  assert.equal(state.calls.length, 2);
});

test("unauthenticated ingestion stops before fetching", async () => {
  let fetched = false;
  const state = memoryStore();
  state.store.resolveOwnerContext = async () => null;
  const result = await ingestCorralioSchedule(state.store, { sourceUrl: "https://secret.example/a.ics" }, {
    fetchSchedule: async () => {
      fetched = true;
      return fetchSuccess();
    },
  });
  assert.equal(fetched, false);
  assert.deepEqual(result, { ok: false, error: "Sign in to connect a schedule." });
});

test("upstream failures return sanitized output without the credential-bearing URL", async () => {
  const secretUrl = "https://calendar.example/team.ics?token=super-secret";
  const result = await ingestCorralioSchedule(memoryStore().store, { sourceUrl: secretUrl }, {
    fetchSchedule: async () => ({ ok: false as const, error: "fetch_failed" as const }),
  });
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.ok ? "" : result.error, /super-secret|calendar\.example|token=/);
});

test("replacement validates before atomically changing the stored connection", async () => {
  const state = memoryStore();
  await ingestCorralioSchedule(state.store, { sourceUrl: "https://calendar.example/old.ics" }, {
    fetchSchedule: fetchSuccess,
  });

  const failed = await replaceCorralioSchedule(state.store, {
    sourceId: "source-1",
    sourceUrl: "https://calendar.example/new.ics?token=secret",
  }, {
    fetchSchedule: async () => ({ ok: false as const, error: "fetch_failed" as const }),
  });
  assert.equal(failed.ok, false);
  assert.equal(state.sourceUrls.get("source-1"), "https://calendar.example/old.ics");
  assert.doesNotMatch(failed.ok ? "" : failed.error, /secret|calendar\.example|token=/);

  const succeeded = await replaceCorralioSchedule(state.store, {
    sourceId: "source-1",
    sourceUrl: "https://calendar.example/new.ics",
  }, { fetchSchedule: fetchSuccess });
  assert.deepEqual(succeeded, { ok: true, sourceId: "source-1", imported: 1 });
  assert.equal(state.sourceUrls.get("source-1"), "https://calendar.example/new.ics");
  assert.equal(state.events.size, 1);
});

test("replacement intentionally rejects an empty feed without changing the working URL", async () => {
  const state = memoryStore();
  await ingestCorralioSchedule(state.store, { sourceUrl: "https://calendar.example/old.ics" }, {
    fetchSchedule: fetchSuccess,
  });
  const result = await replaceCorralioSchedule(state.store, {
    sourceId: "source-1",
    sourceUrl: "https://calendar.example/empty.ics",
  }, {
    fetchSchedule: async () => ({
      ok: true as const,
      text: [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:past-game",
        "DTSTART:20000101T170000Z",
        "SUMMARY:Past Game",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\n"),
      finalUrl: "https://calendar.example/empty.ics",
    }),
  });
  assert.deepEqual(result, { ok: false, error: "No upcoming events were found in that calendar." });
  assert.equal(state.sourceUrls.get("source-1"), "https://calendar.example/old.ics");
});
