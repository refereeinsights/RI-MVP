"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import { readOrCreateLodgingSessionId } from "@/lib/lodgingSession";
import { readOrRememberHotelDistributionSource } from "@/lib/hotelMeasurement";
import { buildTeamHotelBookingHref } from "@/lib/teamHotelBooking";
import { createTeamHotelCtaInteractionId, rememberPendingTeamHotelEntry, rememberLastTeamHotelCtaInteractionId } from "@/lib/teamHotelClientTracking";
import { evaluateTournamentTeamTravelEligibility } from "@/lib/teamTravelEligibility";
import type { TournamentHotelVenueInput } from "@/lib/tournamentHotelSelection";
import { buildTeamHotelTournamentCalloutConfig } from "@/lib/teamHotelTournamentCallout";
import type { PlannerActivationAssignment } from "@/lib/planner/plannerActivationExperiment";
import styles from "./TournamentPlanningCtasClient.module.css";

export default function TournamentPlanningCtasClient(props: {
  tournamentId: string;
  tournamentSlug: string;
  tournamentName?: string | null;
  sport?: string | null;
  plannerSessionId: string;
  weekendHref: string;
  primaryVenueId?: string | null;
  hotelSearchVenues: TournamentHotelVenueInput[];
  city: string | null;
  state: string | null;
  startDate: string | null;
  endDate: string | null;
  authState: "signed_out" | "unverified" | "verified";
  entitlement: "explorer" | "insider" | "weekend_pro" | "unknown";
  plannerActivationExperiment: PlannerActivationAssignment;
}) {
  const slug = String(props.tournamentSlug ?? "").trim();
  const viewedRef = useRef(false);

  const mapHref = `/tournaments/${encodeURIComponent(slug)}/map`;
  const tournamentHotelsHref = `/tournaments/${encodeURIComponent(slug)}/hotels`;
  const plannerSessionId = props.plannerSessionId;
  const weekendHref = props.weekendHref;
  const teamHotelCallout = buildTeamHotelTournamentCalloutConfig();
  const teamTravelEligibility = evaluateTournamentTeamTravelEligibility({
    tournamentId: props.tournamentId,
    tournamentName: props.tournamentName ?? null,
    venueId: props.primaryVenueId ?? null,
    city: props.city,
    state: props.state,
    startDate: props.startDate,
    endDate: props.endDate,
  });
  const teamHotelHref = buildTeamHotelBookingHref({
    tournamentId: props.tournamentId,
    tournamentSlug: props.tournamentSlug,
    tournamentName: props.tournamentName ?? null,
    venueId: props.primaryVenueId ?? null,
    city: props.city,
    state: props.state,
    sport: props.sport ?? null,
    checkin: props.startDate,
    checkout: props.endDate,
    entrySource: "tournament_detail",
    entryPageType: "tournament",
    entryPath: `/tournaments/${encodeURIComponent(slug)}`,
    entryPlacement: "tournament_detail_team_hotel_cta",
  });
  useEffect(() => {
    if (viewedRef.current) return;
    if (!slug) return;
    if (!teamTravelEligibility.eligible) return;
    viewedRef.current = true;
    void trackTiEvent("weekend_planner_contextual_cta_viewed", {
      surface: "tournament",
      source_page_type: "tournament",
      current_page_type: "tournament",
      current_page_path: typeof window !== "undefined" ? window.location.pathname : undefined,
      cta_type: "weekend_plan",
      auth_state: props.authState,
      entitlement: props.entitlement,
      context_type: "tournament",
      tournament_id: props.tournamentId,
      tournament_slug: slug,
      experiment_name: props.plannerActivationExperiment.experimentName,
      experiment_variant: props.plannerActivationExperiment.variant,
      feature_flag_state: props.plannerActivationExperiment.featureFlagState,
    });
    void trackTiEvent("team_hotel_cta_viewed", {
      surface: "tournament",
      source_page_type: "tournament",
      current_page_type: "tournament",
      current_page_path: typeof window !== "undefined" ? window.location.pathname : undefined,
      cta_type: "team_hotel",
      auth_state: props.authState,
      entitlement: props.entitlement,
      context_type: "team_hotel",
      tournament_id: props.tournamentId,
      tournament_slug: slug,
      venue_id: props.primaryVenueId ?? undefined,
      sport: props.sport ?? undefined,
      team_travel_intent_level: teamTravelEligibility.intentLevel,
      team_travel_eligibility_reason: teamTravelEligibility.reason,
      team_travel_cta_level: teamTravelEligibility.ctaLevel,
    });
  }, [
    props.authState,
    props.entitlement,
    props.plannerActivationExperiment.experimentName,
    props.plannerActivationExperiment.featureFlagState,
    props.plannerActivationExperiment.variant,
    props.primaryVenueId,
    props.sport,
    props.tournamentId,
    slug,
    teamTravelEligibility.ctaLevel,
    teamTravelEligibility.eligible,
    teamTravelEligibility.intentLevel,
    teamTravelEligibility.reason,
  ]);

  if (!slug) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.copyBlock}>
        <div className={styles.eyebrow}>Planning for this tournament?</div>
        <div className={styles.body}>
          Keep venues, schedules, travel notes, and parent logistics organized for this event.
        </div>
      </div>

      <div className={`detailLinksRow ${styles.primaryRow}`}>
        <Link
          className={styles.primaryCta}
          href={weekendHref}
          onClick={() => {
            void trackTiEvent("weekend_planner_contextual_cta_clicked", {
              surface: "tournament",
              source_page_type: "tournament",
              current_page_type: "tournament",
              current_page_path: typeof window !== "undefined" ? window.location.pathname : undefined,
              planner_session_id: plannerSessionId,
              cta_type: "weekend_plan",
              auth_state: props.authState,
              entitlement: props.entitlement,
              context_type: "tournament",
              tournament_id: props.tournamentId,
              tournament_slug: slug,
              experiment_name: props.plannerActivationExperiment.experimentName,
              experiment_variant: props.plannerActivationExperiment.variant,
              feature_flag_state: props.plannerActivationExperiment.featureFlagState,
            });
            void trackTiEvent("tournament_detail_weekend_plan_clicked", {
              page_type: "tournament_detail",
              tournament_id: props.tournamentId,
              tournament_slug: slug,
              source_page: "tournament_detail",
              cta: "weekend_plan",
              href: weekendHref,
              experiment_name: props.plannerActivationExperiment.experimentName,
              experiment_variant: props.plannerActivationExperiment.variant,
              feature_flag_state: props.plannerActivationExperiment.featureFlagState,
            });
          }}
        >
          Plan this tournament
        </Link>
        <Link
          className={`secondaryLink ${styles.secondaryCta}`}
          href={mapHref}
          onClick={() => {
            void trackTiEvent("tournament_detail_venue_map_clicked", {
              page_type: "tournament_detail",
              tournament_id: props.tournamentId,
              tournament_slug: slug,
              source_page: "tournament_detail",
              cta: "venue_map",
              href: mapHref,
            });
          }}
        >
          Open venue map →
        </Link>
        <Link
          className={`secondaryLink ${styles.secondaryCta}`}
          href={tournamentHotelsHref}
          onClick={() => {
            void trackTiEvent("tournament_detail_hotel_cta_clicked", {
              surface: "tournament_detail",
              source_page_type: "tournament",
              cta_type: "hotels",
              cta_location: "stay_close",
              context_type: "tournament",
              tournament_id: props.tournamentId,
              tournament_slug: slug,
              session_id: readOrCreateLodgingSessionId(),
              distribution_source: readOrRememberHotelDistributionSource(),
            });
          }}
        >
          Find tournament hotels
        </Link>
      </div>

      {teamTravelEligibility.eligible ? (
        <div className={styles.teamHotelRow}>
          <Link
            className={styles.teamHotelCallout}
            href={teamHotelHref}
            target={teamHotelCallout.target}
            rel={teamHotelCallout.rel}
            title={teamHotelCallout.title}
            onClick={() => {
              const ctaInteractionId = createTeamHotelCtaInteractionId();
              rememberLastTeamHotelCtaInteractionId(ctaInteractionId);
              rememberPendingTeamHotelEntry({
                key: `tournament:${Date.now().toString(36)}:${ctaInteractionId}`,
                sourceSurface: "tournament",
                sourcePath: typeof window !== "undefined" ? window.location.pathname + window.location.search : `/tournaments/${encodeURIComponent(slug)}`,
                ctaInteractionId,
              });
              void trackTiEvent("team_hotel_cta_clicked", {
                surface: "tournament",
                source_page_type: "tournament",
                current_page_type: "tournament",
                current_page_path: typeof window !== "undefined" ? window.location.pathname : undefined,
                cta_type: "team_hotel",
                auth_state: props.authState,
                entitlement: props.entitlement,
                context_type: "team_hotel",
                cta_interaction_id: ctaInteractionId,
                tournament_id: props.tournamentId,
                tournament_slug: slug,
                venue_id: props.primaryVenueId ?? undefined,
                sport: props.sport ?? undefined,
                entry_source: "tournament_detail",
                entry_page_type: "tournament",
                entry_path: typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined,
                entry_placement: "tournament_detail_team_hotel_cta",
                team_travel_intent_level: teamTravelEligibility.intentLevel,
                team_travel_eligibility_reason: teamTravelEligibility.reason,
                team_travel_cta_level: teamTravelEligibility.ctaLevel,
              }, { preferBeacon: true });
            }}
          >
            <span className={styles.teamHotelCalloutCopy}>
              <span className={styles.teamHotelCalloutHeadline}>{teamHotelCallout.headline}</span>
              <span className={styles.teamHotelCalloutLabel}>
                {teamHotelCallout.label}
                <span className={styles.srOnly}> Opens in a new tab.</span>
              </span>
            </span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
