import type { PlannerSessionContext } from "./plannerSession";

type FirstActionAvailabilityParams = {
  allowAnonymousPlanner: boolean;
  initialLoadSettled: boolean;
  eventsPagingBusy: boolean;
  busy: boolean;
  createOpen: boolean;
  anonymousManualEventCount: number;
  plannerSessionContext: PlannerSessionContext | null | undefined;
  ctaRendered: boolean;
  ctaEnabled: boolean;
  ctaInteractive: boolean;
};

export function hasAnonymousTournamentSeededContext(context: PlannerSessionContext | null | undefined) {
  return Boolean(
    context?.planner_session_id &&
      context?.entry_page_type === "tournament" &&
      String(context?.tournament_id ?? "").trim().length > 0,
  );
}

export function shouldEmitPlannerFirstActionAvailable(params: FirstActionAvailabilityParams) {
  return Boolean(
    params.allowAnonymousPlanner &&
      params.initialLoadSettled &&
      !params.eventsPagingBusy &&
      !params.busy &&
      !params.createOpen &&
      params.anonymousManualEventCount === 0 &&
      hasAnonymousTournamentSeededContext(params.plannerSessionContext) &&
      params.ctaRendered &&
      params.ctaEnabled &&
      params.ctaInteractive,
  );
}
