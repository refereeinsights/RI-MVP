"use client";

import { useEffect, useRef } from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

type Props = {
  pageType: "venue_index" | "venue_detail";
  venueId?: string | null;
  venueSlug?: string | null;
  sport?: string | null;
  state?: string | null;
  sourceTournamentId?: string | null;
  sourceTournamentSlug?: string | null;
};

export default function VenuePageViewTracker({
  pageType,
  venueId,
  venueSlug,
  sport,
  state,
  sourceTournamentId,
  sourceTournamentSlug,
}: Props) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    const href = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "";
    const venueKey = venueId ?? venueSlug ?? "unknown";
    const dedupeKey = `ti_analytics:venue_page_viewed:${pageType}:${venueKey}:${href}`;

    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        if (window.sessionStorage.getItem(dedupeKey) === "1") {
          firedRef.current = true;
          return;
        }
        window.sessionStorage.setItem(dedupeKey, "1");
      }
    } catch {
      // Ignore storage failures (Safari private mode, etc).
    }

    firedRef.current = true;

    trackTiEvent("venue_page_viewed", {
      page_type: pageType,
      href,
      venue_id: venueId ?? null,
      venue_slug: venueSlug ?? null,
      sport: sport ?? null,
      state: state ?? null,
      source_tournament_id: sourceTournamentId ?? null,
      source_tournament_slug: sourceTournamentSlug ?? null,
    });
  }, [pageType, venueId, venueSlug, sport, state, sourceTournamentId, sourceTournamentSlug]);

  return null;
}
