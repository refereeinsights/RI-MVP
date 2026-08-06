"use client";

import Link from "next/link";
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
import type { TeamTravelCtaLevel, TeamTravelEligibilityReason, TeamTravelIntentLevel } from "@/lib/teamTravelEligibility";

type TeamTravelVenueLinkProps = {
  href: string;
  label: string;
  className?: string;
  authState: "signed_out" | "unverified" | "verified";
  entitlement: "explorer" | "insider" | "weekend_pro" | "unknown";
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
  intentLevel: TeamTravelIntentLevel;
  eligibilityReason: TeamTravelEligibilityReason;
  ctaLevel: TeamTravelCtaLevel;
};

export default function TeamTravelVenueLink(props: TeamTravelVenueLinkProps) {
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    void sendTiAnalytics("team_hotel_cta_viewed", {
      surface: "venue",
      source_page_type: "venue",
      cta_type: "team_hotel",
      auth_state: props.authState,
      entitlement: props.entitlement,
      context_type: "team_hotel",
      session_id: getTeamHotelSessionId(),
      anonymous_visitor_id: getAnonymousVisitorId(),
      source_surface: "venue",
      source_path: currentPathWithSearch() ?? props.entryPath ?? undefined,
      entry_source: props.entrySource ?? undefined,
      entry_page_type: props.entryPageType ?? undefined,
      entry_path: props.entryPath ?? undefined,
      entry_placement: props.entryPlacement ?? undefined,
      current_page_type: "venue",
      current_page_path: typeof window !== "undefined" ? window.location.pathname : undefined,
      tournament_id: props.tournamentId ?? undefined,
      tournament_slug: props.tournamentSlug ?? undefined,
      venue_id: props.venueId ?? undefined,
      sport: props.sport ?? undefined,
      event_start_date: props.eventStartDate ?? undefined,
      event_end_date: props.eventEndDate ?? undefined,
      team_travel_intent_level: props.intentLevel,
      team_travel_eligibility_reason: props.eligibilityReason,
      team_travel_cta_level: props.ctaLevel,
    });
  }, [
    props.authState,
    props.ctaLevel,
    props.eligibilityReason,
    props.entitlement,
    props.entryPageType,
    props.entryPath,
    props.entryPlacement,
    props.entrySource,
    props.eventEndDate,
    props.eventStartDate,
    props.intentLevel,
    props.sport,
    props.tournamentId,
    props.tournamentSlug,
    props.venueId,
  ]);

  return (
    <Link
      href={props.href}
      className={props.className}
      onClick={() => {
        const ctaInteractionId = createTeamHotelCtaInteractionId();
        rememberLastTeamHotelCtaInteractionId(ctaInteractionId);
        rememberPendingTeamHotelEntry({
          key: `venue:${Date.now().toString(36)}:${ctaInteractionId}`,
          sourceSurface: "venue",
          sourcePath: currentPathWithSearch() ?? props.entryPath ?? "/venues",
          ctaInteractionId,
        });
        void sendTiAnalytics("team_hotel_cta_clicked", {
          surface: "venue",
          source_page_type: "venue",
          cta_type: "team_hotel",
          auth_state: props.authState,
          entitlement: props.entitlement,
          context_type: "team_hotel",
          session_id: getTeamHotelSessionId(),
          anonymous_visitor_id: getAnonymousVisitorId(),
          source_surface: "venue",
          source_path: currentPathWithSearch() ?? props.entryPath ?? undefined,
          cta_interaction_id: ctaInteractionId,
          entry_source: props.entrySource ?? undefined,
          entry_page_type: props.entryPageType ?? undefined,
          entry_path: props.entryPath ?? undefined,
          entry_placement: props.entryPlacement ?? undefined,
          current_page_type: "venue",
          current_page_path: typeof window !== "undefined" ? window.location.pathname : undefined,
          tournament_id: props.tournamentId ?? undefined,
          tournament_slug: props.tournamentSlug ?? undefined,
          venue_id: props.venueId ?? undefined,
          sport: props.sport ?? undefined,
          event_start_date: props.eventStartDate ?? undefined,
          event_end_date: props.eventEndDate ?? undefined,
          team_travel_intent_level: props.intentLevel,
          team_travel_eligibility_reason: props.eligibilityReason,
          team_travel_cta_level: props.ctaLevel,
        }, { preferBeacon: true });
      }}
    >
      {props.label}
    </Link>
  );
}
