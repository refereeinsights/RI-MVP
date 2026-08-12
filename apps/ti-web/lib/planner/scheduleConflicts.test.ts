import test from "node:test";
import assert from "node:assert/strict";

import { detectLoadedEventConflicts } from "./scheduleConflicts";
import type { PlannerEventRow } from "./types";

function event(overrides: Partial<PlannerEventRow>): PlannerEventRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "anonymous",
    weekend_id: null,
    title: "Game",
    event_type: "game",
    team_name: null,
    opponent_name: null,
    tournament_id: "22222222-2222-4222-8222-222222222222",
    venue_id: null,
    field_label: null,
    address_text: null,
    city: null,
    state: null,
    starts_at: "2026-09-12T16:00:00.000Z",
    ends_at: "2026-09-12T17:00:00.000Z",
    timezone: "America/Los_Angeles",
    notes: null,
    child_profile_id: null,
    team_profile_id: null,
    source_type: "manual",
    source_id: null,
    source_event_uid: null,
    created_at: "2026-08-12T00:00:00.000Z",
    updated_at: "2026-08-12T00:00:00.000Z",
    ...overrides,
  };
}

test("seeded tournament context never creates schedule conflicts", () => {
  const manual = event({});
  const seed = event({
    id: "seeded-tournament:22222222-2222-4222-8222-222222222222",
    title: "Fall Classic",
    source_type: "tournament",
    starts_at: "2026-09-12T09:00:00.000Z",
    ends_at: "2026-09-12T18:00:00.000Z",
  });

  assert.equal(detectLoadedEventConflicts([seed, manual]).size, 0);
});

test("overlapping user-authored events still create schedule conflicts", () => {
  const first = event({});
  const second = event({
    id: "33333333-3333-4333-8333-333333333333",
    starts_at: "2026-09-12T16:30:00.000Z",
    ends_at: "2026-09-12T17:30:00.000Z",
  });

  const conflicts = detectLoadedEventConflicts([first, second]);
  assert.equal(conflicts.get(first.id)?.conflictCount, 1);
  assert.equal(conflicts.get(second.id)?.conflictCount, 1);
});
