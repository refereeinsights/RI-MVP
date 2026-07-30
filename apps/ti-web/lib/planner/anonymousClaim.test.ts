import test from "node:test";
import assert from "node:assert/strict";

import { buildPlannerEventDedupSignature, filterAnonymousClaimablePlannerEvents } from "./anonymousClaim";
import type { PlannerEventRow } from "./types";

function event(overrides: Partial<PlannerEventRow> = {}): PlannerEventRow {
  return {
    id: "anon-event:11111111-1111-4111-8111-111111111111",
    user_id: "anonymous",
    weekend_id: null,
    title: "Team Dinner",
    event_type: "meal",
    team_name: null,
    opponent_name: null,
    tournament_id: "22222222-2222-4222-8222-222222222222",
    venue_id: "33333333-3333-4333-8333-333333333333",
    field_label: null,
    address_text: null,
    city: null,
    state: null,
    starts_at: "2026-08-01T01:00:00.000Z",
    ends_at: "2026-08-01T02:00:00.000Z",
    timezone: "UTC",
    notes: null,
    child_profile_id: null,
    team_profile_id: null,
    source_type: "manual",
    source_id: null,
    source_event_uid: null,
    created_at: "2026-07-30T00:00:00.000Z",
    updated_at: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

test("filters claimable anonymous manual events only", () => {
  const input = [
    event(),
    event({ id: "seeded-tournament:abc", source_type: "tournament" }),
    event({ id: "44444444-4444-4444-8444-444444444444" }),
  ];

  const result = filterAnonymousClaimablePlannerEvents(input);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "anon-event:11111111-1111-4111-8111-111111111111");
});

test("dedupe signature ignores title casing and repeated whitespace", () => {
  const a = event({ title: " Team   Dinner " });
  const b = event({ title: "team dinner" });

  assert.equal(buildPlannerEventDedupSignature(a), buildPlannerEventDedupSignature(b));
});

test("dedupe signature changes when timing or tournament context changes", () => {
  const base = event();
  const differentStart = event({ starts_at: "2026-08-01T01:30:00.000Z" });
  const differentTournament = event({ tournament_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });

  assert.notEqual(buildPlannerEventDedupSignature(base), buildPlannerEventDedupSignature(differentStart));
  assert.notEqual(buildPlannerEventDedupSignature(base), buildPlannerEventDedupSignature(differentTournament));
});
