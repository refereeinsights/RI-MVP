"use client";

import { useEffect, useRef } from "react";
import { sendTiAnalytics } from "@/lib/analytics";
import {
  createTeamHotelCtaInteractionId,
  currentPathWithSearch,
  getAnonymousVisitorId,
  getTeamHotelSessionId,
  rememberPendingTeamHotelEntry,
  rememberLastTeamHotelCtaInteractionId,
} from "@/lib/teamHotelClientTracking";

type TeamHotelLandingPrimaryCtaProps = {
  authState: "signed_out" | "unverified" | "verified";
  entitlement: "explorer" | "insider" | "weekend_pro" | "unknown";
  userId?: string | null;
  tournamentId?: string | null;
  tournamentSlug?: string | null;
  venueId?: string | null;
  sport?: string | null;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
  entrySource?: string | null;
  entryPageType?: string | null;
  entryPath?: string | null;
  entryPlacement?: string | null;
  className?: string;
};

export default function TeamHotelLandingPrimaryCta(props: TeamHotelLandingPrimaryCtaProps) {
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    void sendTiAnalytics("team_hotel_cta_viewed", {
      surface: "team_hotel",
      source_surface: "team_hotel_booking_landing",
      source_page_type: "team_hotel_booking",
      cta_type: "team_hotel",
      auth_state: props.authState,
      entitlement: props.entitlement,
      context_type: "team_hotel",
      session_id: getTeamHotelSessionId(),
      anonymous_visitor_id: getAnonymousVisitorId(),
      user_id: props.userId ?? undefined,
      source_path: currentPathWithSearch() ?? "/team-hotel-booking",
      entry_source: props.entrySource ?? undefined,
      entry_page_type: props.entryPageType ?? undefined,
      entry_path: props.entryPath ?? undefined,
      entry_placement: props.entryPlacement ?? undefined,
      current_page_type: "team_hotel_booking",
      current_page_path: "/team-hotel-booking",
      tournament_id: props.tournamentId ?? undefined,
      tournament_slug: props.tournamentSlug ?? undefined,
      venue_id: props.venueId ?? undefined,
      sport: props.sport ?? undefined,
      event_start_date: props.eventStartDate ?? undefined,
      event_end_date: props.eventEndDate ?? undefined,
    });
  }, [
    props.authState,
    props.entitlement,
    props.entryPageType,
    props.entryPath,
    props.entryPlacement,
    props.entrySource,
    props.eventEndDate,
    props.eventStartDate,
    props.sport,
    props.tournamentId,
    props.tournamentSlug,
    props.userId,
    props.venueId,
  ]);

  return (
    <a
      href="#team-hotel-blocks"
      className={props.className}
      onClick={() => {
        const ctaInteractionId = createTeamHotelCtaInteractionId();
        rememberLastTeamHotelCtaInteractionId(ctaInteractionId);
        rememberPendingTeamHotelEntry({
          key: `landing:${Date.now().toString(36)}:${ctaInteractionId}`,
          sourceSurface: "team_hotel_booking_landing",
          sourcePath: currentPathWithSearch() ?? "/team-hotel-booking",
          ctaInteractionId,
        });
        void sendTiAnalytics("team_hotel_cta_clicked", {
          surface: "team_hotel",
          source_surface: "team_hotel_booking_landing",
          source_page_type: "team_hotel_booking",
          cta_type: "team_hotel",
          auth_state: props.authState,
          entitlement: props.entitlement,
          context_type: "team_hotel",
          session_id: getTeamHotelSessionId(),
          anonymous_visitor_id: getAnonymousVisitorId(),
          user_id: props.userId ?? undefined,
          source_path: currentPathWithSearch() ?? "/team-hotel-booking",
          cta_interaction_id: ctaInteractionId,
          entry_source: props.entrySource ?? undefined,
          entry_page_type: props.entryPageType ?? undefined,
          entry_path: props.entryPath ?? undefined,
          entry_placement: props.entryPlacement ?? undefined,
          current_page_type: "team_hotel_booking",
          current_page_path: "/team-hotel-booking",
          tournament_id: props.tournamentId ?? undefined,
          tournament_slug: props.tournamentSlug ?? undefined,
          venue_id: props.venueId ?? undefined,
          sport: props.sport ?? undefined,
          event_start_date: props.eventStartDate ?? undefined,
          event_end_date: props.eventEndDate ?? undefined,
        }, { preferBeacon: true });
      }}
    >
      Request Team Hotel Options
    </a>
  );
}
