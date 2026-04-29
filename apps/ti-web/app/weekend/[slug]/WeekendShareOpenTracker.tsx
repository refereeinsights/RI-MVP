"use client";

import { useEffect } from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

export default function WeekendShareOpenTracker(props: {
  tournamentSlug: string;
  venue: string | null;
  source: "share" | "unknown";
  utm_source: string | null;
  utm_medium: string | null;
}) {
  useEffect(() => {
    if (props.source !== "share" && (props.utm_source ?? "").toLowerCase() !== "share") return;
    trackTiEvent("weekend_page_opened", {
      tournament_slug: props.tournamentSlug,
      venue: props.venue,
      source: "share",
      utm_source: props.utm_source,
      utm_medium: props.utm_medium,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

