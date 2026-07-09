"use client";

import { useEffect, useRef } from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

type Props = {
  tournamentId: string;
  tournamentSlug: string;
  sourcePage: "tournament_detail" | "direct" | "unknown";
  hasExistingPlan: boolean;
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
  }, [props.hasExistingPlan, props.sourcePage, props.tournamentId, props.tournamentSlug]);

  return null;
}
