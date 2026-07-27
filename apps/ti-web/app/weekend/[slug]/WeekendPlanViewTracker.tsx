"use client";

import { useEffect, useRef } from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import { markPlannerSessionEventSeen, wasPlannerSessionEventSeen } from "@/lib/planner/plannerSession";

type Props = {
  plannerSessionId: string;
  tournamentId: string;
  tournamentSlug: string;
  venueId: string | null;
  sourcePage: "tournament_detail" | "direct" | "unknown";
  hasExistingPlan: boolean;
  authState: "signed_out" | "unverified" | "verified";
  entitlement: "explorer" | "insider" | "weekend_pro" | "unknown";
  entryPath: string;
  entryPlacement: string;
  requestSource: string;
};

export default function WeekendPlanViewTracker(props: Props) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    void trackTiEvent("weekend_plan_page_viewed", {
      page_type: "weekend_plan",
      tournament_id: props.tournamentId,
      tournament_slug: props.tournamentSlug,
      source_page: props.sourcePage,
      has_existing_plan: props.hasExistingPlan,
    });

    if (!wasPlannerSessionEventSeen(props.plannerSessionId, "weekend_planner_entry_viewed")) {
      markPlannerSessionEventSeen(props.plannerSessionId, "weekend_planner_entry_viewed");
      void trackTiEvent("weekend_planner_entry_viewed", {
        planner_session_id: props.plannerSessionId,
        surface: "tournament",
        source_page_type: "tournament",
        current_page_type: "planner_entry",
        current_page_path: props.entryPath,
        entry_source: props.sourcePage,
        entry_page_type: "tournament",
        entry_path: props.entryPath,
        entry_placement: props.entryPlacement,
        request_source: props.requestSource,
        cta_type: "weekend_plan",
        context_type: "tournament",
        auth_state: props.authState,
        entitlement: props.entitlement,
        tournament_id: props.tournamentId,
        tournament_slug: props.tournamentSlug,
        venue_id: props.venueId,
      });
    }

    if (props.authState !== "verified" && !wasPlannerSessionEventSeen(props.plannerSessionId, "weekend_planner_auth_gate_viewed")) {
      markPlannerSessionEventSeen(props.plannerSessionId, "weekend_planner_auth_gate_viewed");
      void trackTiEvent("weekend_planner_auth_gate_viewed", {
        planner_session_id: props.plannerSessionId,
        surface: "planner",
        source_page_type: "tournament",
        current_page_type: "auth",
        current_page_path: props.entryPath,
        entry_source: props.sourcePage,
        entry_page_type: "tournament",
        entry_path: props.entryPath,
        entry_placement: props.entryPlacement,
        request_source: props.requestSource,
        auth_state: props.authState,
        entitlement: props.entitlement,
        tournament_id: props.tournamentId,
        tournament_slug: props.tournamentSlug,
        venue_id: props.venueId,
        action_surface: "weekend_plan",
      });
    }
  }, [
    props.authState,
    props.entitlement,
    props.entryPath,
    props.entryPlacement,
    props.hasExistingPlan,
    props.plannerSessionId,
    props.sourcePage,
    props.tournamentId,
    props.tournamentSlug,
    props.venueId,
  ]);

  return null;
}
