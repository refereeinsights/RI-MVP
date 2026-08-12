import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAnonymousPlannerEvent,
  loadAnonymousPlannerEvents,
  saveAnonymousPlannerEvents,
} from "./anonymousPlanner";
import type { PlannerSessionContext } from "./plannerSession";
import type { PlannerEventRow } from "./types";

const context: PlannerSessionContext = {
  planner_session_id: "11111111-1111-4111-8111-111111111111",
  tournament_id: "22222222-2222-4222-8222-222222222222",
  entry_page_type: "tournament",
};

function installWindow(localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }) {
  Object.defineProperty(globalThis, "window", {
    value: { localStorage },
    configurable: true,
  });
}

function manualEvent() {
  return buildAnonymousPlannerEvent({
    title: "Game — Fall Classic",
    event_type: "game",
    starts_at: "2026-09-12T16:00:00.000Z",
    ends_at: "2026-09-12T17:00:00.000Z",
    timezone: "America/Los_Angeles",
    tournament_id: context.tournament_id,
    field_label: "Field 3",
  });
}

test("anonymous storage reports success and preserves tournament and field context", () => {
  const values = new Map<string, string>();
  installWindow({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  });
  const row = manualEvent();

  assert.equal(saveAnonymousPlannerEvents(context, [row]), true);
  assert.ok(values.has(`ti:anonymous-planner:v1:tournament:${context.tournament_id}`));
  assert.equal(loadAnonymousPlannerEvents(context)[0]?.tournament_id, context.tournament_id);
  assert.equal(loadAnonymousPlannerEvents(context)[0]?.field_label, "Field 3");
});

test("seeded tournament context is ephemeral on write and filtered from legacy snapshots", () => {
  const values = new Map<string, string>();
  installWindow({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  });
  const manual = manualEvent();
  const seeded: PlannerEventRow = {
    ...manual,
    id: `seeded-tournament:${context.tournament_id}`,
    title: "Fall Classic",
    source_type: "tournament",
  };
  const tournamentKey = `ti:anonymous-planner:v1:tournament:${context.tournament_id}`;

  assert.equal(saveAnonymousPlannerEvents(context, [seeded, manual]), true);
  const written = JSON.parse(values.get(tournamentKey) ?? "null") as { events: PlannerEventRow[] };
  assert.deepEqual(written.events.map((event) => event.id), [manual.id]);

  values.set(
    tournamentKey,
    JSON.stringify({
      plannerSessionId: context.planner_session_id,
      tournamentId: context.tournament_id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      events: [seeded, manual],
    }),
  );
  assert.deepEqual(loadAnonymousPlannerEvents(context).map((event) => event.id), [manual.id]);
});

test("anonymous storage reports failure when persistence throws", () => {
  installWindow({
    getItem: () => null,
    setItem: () => {
      throw new Error("storage unavailable");
    },
    removeItem: () => undefined,
  });

  assert.equal(saveAnonymousPlannerEvents(context, []), false);
});
