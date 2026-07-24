import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlannerHref,
  buildPlannerSessionParams,
  normalizePlannerSessionId,
  parsePlannerSessionContext,
} from "./plannerSession";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

test("plannerSession round-trips canonical context", () => {
  const href = buildPlannerHref("/weekend-planner", {
    planner_session_id: SESSION_ID,
    tournament_id: "t-1",
    tournament_slug: "summer-classic",
    venue_id: "v-1",
    entry_source: "tournament_detail",
    entry_page_type: "tournament",
    entry_path: "/weekend/summer-classic?source=tournament_detail",
    entry_placement: "tournament_detail_planner_cta",
    current_page_type: "planner",
    current_page_path: "/weekend-planner",
    planner_auth: true,
  });

  const parsed = new URL(href, "https://www.tournamentinsights.com");
  const ctx = parsePlannerSessionContext(parsed.searchParams);
  assert.ok(ctx);
  assert.equal(ctx?.planner_session_id, SESSION_ID);
  assert.equal(ctx?.entry_page_type, "tournament");
  assert.equal(ctx?.entry_source, "tournament_detail");
  assert.equal(ctx?.planner_auth, true);
});

test("plannerSession params omit invalid session ids", () => {
  const params = buildPlannerSessionParams({
    planner_session_id: "bad-id",
    tournament_id: "t-1",
  });
  assert.equal(params.toString(), "");
  assert.equal(normalizePlannerSessionId("bad-id"), null);
});
