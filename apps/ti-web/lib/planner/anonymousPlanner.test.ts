import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAnonymousPlannerEvent,
  loadAnonymousPlannerEvents,
  saveAnonymousPlannerEvents,
} from "./anonymousPlanner";
import type { PlannerSessionContext } from "./plannerSession";

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

test("anonymous storage reports success and preserves tournament and field context", () => {
  const values = new Map<string, string>();
  installWindow({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  });
  const row = buildAnonymousPlannerEvent({
    title: "Game — Fall Classic",
    event_type: "game",
    starts_at: "2026-09-12T16:00:00.000Z",
    ends_at: "2026-09-12T17:00:00.000Z",
    timezone: "America/Los_Angeles",
    tournament_id: context.tournament_id,
    field_label: "Field 3",
  });

  assert.equal(saveAnonymousPlannerEvents(context, [row]), true);
  assert.ok(values.has(`ti:anonymous-planner:v1:tournament:${context.tournament_id}`));
  assert.equal(loadAnonymousPlannerEvents(context)[0]?.tournament_id, context.tournament_id);
  assert.equal(loadAnonymousPlannerEvents(context)[0]?.field_label, "Field 3");
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
