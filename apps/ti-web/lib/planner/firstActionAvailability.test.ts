import test from "node:test";
import assert from "node:assert/strict";
import { hasAnonymousTournamentSeededContext, shouldEmitPlannerFirstActionAvailable } from "./firstActionAvailability";

const PLANNER_CONTEXT = {
  planner_session_id: "11111111-1111-4111-8111-111111111111",
  entry_page_type: "tournament" as const,
  tournament_id: "tournament-1",
};

test("first action availability requires anonymous seeded tournament context", () => {
  assert.equal(hasAnonymousTournamentSeededContext(PLANNER_CONTEXT), true);
  assert.equal(
    hasAnonymousTournamentSeededContext({
      ...PLANNER_CONTEXT,
      entry_page_type: "planner",
    }),
    false,
  );
  assert.equal(
    hasAnonymousTournamentSeededContext({
      ...PLANNER_CONTEXT,
      tournament_id: null,
    }),
    false,
  );
});

test("first action availability emits only for the interactive anonymous planner path", () => {
  assert.equal(
    shouldEmitPlannerFirstActionAvailable({
      allowAnonymousPlanner: true,
      initialLoadSettled: true,
      eventsPagingBusy: false,
      busy: false,
      createOpen: false,
      anonymousManualEventCount: 0,
      plannerSessionContext: PLANNER_CONTEXT,
      ctaRendered: true,
      ctaEnabled: true,
      ctaInteractive: true,
    }),
    true,
  );
});

test("first action availability stays false for authenticated or incomplete states", () => {
  assert.equal(
    shouldEmitPlannerFirstActionAvailable({
      allowAnonymousPlanner: false,
      initialLoadSettled: true,
      eventsPagingBusy: false,
      busy: false,
      createOpen: false,
      anonymousManualEventCount: 0,
      plannerSessionContext: PLANNER_CONTEXT,
      ctaRendered: true,
      ctaEnabled: true,
      ctaInteractive: true,
    }),
    false,
  );

  assert.equal(
    shouldEmitPlannerFirstActionAvailable({
      allowAnonymousPlanner: true,
      initialLoadSettled: true,
      eventsPagingBusy: false,
      busy: false,
      createOpen: false,
      anonymousManualEventCount: 1,
      plannerSessionContext: PLANNER_CONTEXT,
      ctaRendered: true,
      ctaEnabled: true,
      ctaInteractive: true,
    }),
    false,
  );

  assert.equal(
    shouldEmitPlannerFirstActionAvailable({
      allowAnonymousPlanner: true,
      initialLoadSettled: true,
      eventsPagingBusy: false,
      busy: false,
      createOpen: false,
      anonymousManualEventCount: 0,
      plannerSessionContext: PLANNER_CONTEXT,
      ctaRendered: true,
      ctaEnabled: false,
      ctaInteractive: false,
    }),
    false,
  );
});
