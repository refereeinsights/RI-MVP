import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTournamentPlannerEntryHref,
  buildPlannerHref,
  buildPlannerSessionParams,
  markPlannerSessionEventSeen,
  normalizePlannerSessionId,
  parsePlannerSessionContext,
  wasPlannerSessionEventSeen,
} from "./plannerSession";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

test("plannerSession round-trips canonical context", () => {
  const href = buildPlannerHref("/weekend-planner", {
    planner_session_id: SESSION_ID,
    experiment_name: "anonymous_planner_activation_v1",
    experiment_variant: "treatment",
    feature_flag_state: "enabled",
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
  assert.equal(ctx?.experiment_name, "anonymous_planner_activation_v1");
  assert.equal(ctx?.experiment_variant, "treatment");
  assert.equal(ctx?.feature_flag_state, "enabled");
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

test("tournament planner entry href preserves a provided planner session id", () => {
  const result = buildTournamentPlannerEntryHref("/weekend/summer-classic", {
    planner_session_id: SESSION_ID,
    experiment_name: "anonymous_planner_activation_v1",
    experiment_variant: "control",
    feature_flag_state: "enabled",
    venue_id: "v-1",
    source: "tournament_detail",
  });

  assert.equal(result.plannerSessionId, SESSION_ID);
  const parsed = new URL(result.href, "https://www.tournamentinsights.com");
  assert.equal(parsed.pathname, "/weekend/summer-classic");
  assert.equal(parsed.searchParams.get("planner_session_id"), SESSION_ID);
  assert.equal(parsed.searchParams.get("experiment_name"), "anonymous_planner_activation_v1");
  assert.equal(parsed.searchParams.get("experiment_variant"), "control");
  assert.equal(parsed.searchParams.get("feature_flag_state"), "enabled");
  assert.equal(parsed.searchParams.get("venue"), "v-1");
  assert.equal(parsed.searchParams.get("source"), "tournament_detail");
});

test("planner session event flags suppress duplicate tracking across refresh-like reuse", () => {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    sessionStorage: {
      getItem(key: string) {
        return store.has(key) ? store.get(key) ?? null : null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
    },
  };

  try {
    assert.equal(wasPlannerSessionEventSeen(SESSION_ID, "weekend_planner_first_action_available"), false);
    markPlannerSessionEventSeen(SESSION_ID, "weekend_planner_first_action_available");
    assert.equal(wasPlannerSessionEventSeen(SESSION_ID, "weekend_planner_first_action_available"), true);
    assert.equal(wasPlannerSessionEventSeen(SESSION_ID, "weekend_planner_first_action_cta_viewed"), false);
  } finally {
    delete (globalThis as any).window;
  }
});
