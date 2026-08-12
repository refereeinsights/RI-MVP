import test from "node:test";
import assert from "node:assert/strict";

import {
  isFirstGameDateAllowed,
  normalizeFirstGameTournamentContext,
  tournamentUserAuthoredEvents,
} from "./firstGameActivation";
import type { PlannerEventRow } from "./types";

const TOURNAMENT_A = "22222222-2222-4222-8222-222222222222";
const TOURNAMENT_B = "33333333-3333-4333-8333-333333333333";

function event(overrides: Partial<PlannerEventRow> = {}): PlannerEventRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "anonymous",
    weekend_id: null,
    title: "Game",
    event_type: "game",
    team_name: null,
    opponent_name: null,
    tournament_id: TOURNAMENT_A,
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

test("normalizes valid single-day and multi-day tournament activation context", () => {
  const singleDay = normalizeFirstGameTournamentContext({
    entryPageType: "tournament",
    tournamentId: TOURNAMENT_A,
    tournamentName: "Fall Classic",
    startDate: "2026-09-12",
    endDate: "2026-09-12",
  });
  const multiDay = normalizeFirstGameTournamentContext({
    entryPageType: "tournament",
    tournamentId: TOURNAMENT_A,
    tournamentName: "Fall Classic",
    startDate: "2026-09-12",
    endDate: "2026-09-14",
  });

  assert.equal(singleDay?.isSingleDay, true);
  assert.equal(multiDay?.isSingleDay, false);
  assert.equal(isFirstGameDateAllowed(multiDay!, "2026-09-13"), true);
  assert.equal(isFirstGameDateAllowed(multiDay!, "2026-09-15"), false);
});

test("rejects incomplete, non-tournament, and reversed-date contexts", () => {
  assert.equal(
    normalizeFirstGameTournamentContext({
      entryPageType: "planner",
      tournamentId: TOURNAMENT_A,
      tournamentName: "Fall Classic",
      startDate: "2026-09-12",
    }),
    null,
  );
  assert.equal(
    normalizeFirstGameTournamentContext({
      entryPageType: "tournament",
      tournamentId: "not-a-uuid",
      tournamentName: "Fall Classic",
      startDate: "2026-09-12",
    }),
    null,
  );
  assert.equal(
    normalizeFirstGameTournamentContext({
      entryPageType: "tournament",
      tournamentId: TOURNAMENT_A,
      tournamentName: "Fall Classic",
      startDate: "2026-02-30",
    }),
    null,
  );
  assert.equal(
    normalizeFirstGameTournamentContext({
      entryPageType: "tournament",
      tournamentId: TOURNAMENT_A,
      tournamentName: "",
      startDate: "2026-09-12",
    }),
    null,
  );
  assert.equal(
    normalizeFirstGameTournamentContext({
      entryPageType: "tournament",
      tournamentId: TOURNAMENT_A,
      tournamentName: "Fall Classic",
      startDate: "2026-09-14",
      endDate: "2026-09-12",
    }),
    null,
  );
});

test("eligibility uses manual events for the exact tournament only", () => {
  const rows = [
    event({ source_type: "tournament" }),
    event({ id: "44444444-4444-4444-8444-444444444444", tournament_id: TOURNAMENT_B }),
    event({ id: "55555555-5555-4555-8555-555555555555", tournament_id: TOURNAMENT_A }),
  ];

  assert.deepEqual(
    tournamentUserAuthoredEvents(rows, TOURNAMENT_A).map((row) => row.id),
    ["55555555-5555-4555-8555-555555555555"],
  );
  assert.deepEqual(
    tournamentUserAuthoredEvents(rows, TOURNAMENT_B).map((row) => row.id),
    ["44444444-4444-4444-8444-444444444444"],
  );
});
