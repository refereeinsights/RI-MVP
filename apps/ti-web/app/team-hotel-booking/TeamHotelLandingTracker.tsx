"use client";

import { useEffect, useRef } from "react";
import { sendTiAnalytics } from "@/lib/analytics";

type TeamHotelLandingTrackerProps = {
  authState: "signed_out" | "unverified" | "verified";
  entitlement: "explorer" | "insider" | "weekend_pro" | "unknown";
  tournamentId?: string | null;
  venueId?: string | null;
  entrySource?: string | null;
  entryPageType?: string | null;
  entryPath?: string | null;
  entryPlacement?: string | null;
};

export default function TeamHotelLandingTracker(props: TeamHotelLandingTrackerProps) {
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    void sendTiAnalytics("team_hotel_cta_viewed", {
      surface: "team_hotel",
      source_page_type: "team_hotel_booking",
      cta_type: "team_hotel",
      auth_state: props.authState,
      entitlement: props.entitlement,
      context_type: "team_hotel",
      entry_source: props.entrySource ?? undefined,
      entry_page_type: props.entryPageType ?? undefined,
      entry_path: props.entryPath ?? undefined,
      entry_placement: props.entryPlacement ?? undefined,
      current_page_type: "team_hotel_booking",
      current_page_path: "/team-hotel-booking",
      tournament_id: props.tournamentId ?? undefined,
      venue_id: props.venueId ?? undefined,
    });
  }, [
    props.authState,
    props.entitlement,
    props.entryPageType,
    props.entryPath,
    props.entryPlacement,
    props.entrySource,
    props.tournamentId,
    props.venueId,
  ]);

  return null;
}
