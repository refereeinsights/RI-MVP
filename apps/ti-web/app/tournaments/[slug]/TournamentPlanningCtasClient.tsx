"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import { buildTeamHotelBookingHref } from "@/lib/teamHotelBooking";
import { createTeamHotelCtaInteractionId, rememberPendingTeamHotelEntry, rememberLastTeamHotelCtaInteractionId } from "@/lib/teamHotelClientTracking";
import { evaluateTournamentTeamTravelEligibility } from "@/lib/teamTravelEligibility";
import { resolveTournamentHotelSearchCta, type TournamentHotelVenueInput } from "@/lib/tournamentHotelSelection";
import { buildTeamHotelTournamentCalloutConfig } from "@/lib/teamHotelTournamentCallout";
import type { PlannerActivationAssignment } from "@/lib/planner/plannerActivationExperiment";
import styles from "./TournamentPlanningCtasClient.module.css";

function isValidIsoDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, m, d] = raw.split("-").map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(dt.getTime())) return false;
  return dt.toISOString().slice(0, 10) === raw;
}

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
  const selectorViewedRef = useRef(false);
  const [hotelSelectorOpen, setHotelSelectorOpen] = useState(false);

  const mapHref = `/tournaments/${encodeURIComponent(slug)}/map`;
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
  const travelFallbackHref = (() => {
    const qp = new URLSearchParams();
    const city = String(props.city ?? "").trim();
    const state = String(props.state ?? "").trim();
    if (city) qp.set("city", city);
    if (state) qp.set("state", state);

    const checkin = isValidIsoDate(props.startDate) ? String(props.startDate) : null;
    const checkout = isValidIsoDate(props.endDate) ? String(props.endDate) : null;
    if (checkin) qp.set("checkin", checkin);
    if (checkout) qp.set("checkout", checkout);

    const qs = qp.toString();
    return qs ? `/book-travel?${qs}` : "/book-travel";
  })();
  const hotelSearchCta = useMemo(
    () =>
      resolveTournamentHotelSearchCta({
        tournamentId: props.tournamentId,
        startDate: props.startDate,
        endDate: props.endDate,
        fallbackHref: travelFallbackHref,
        venues: props.hotelSearchVenues,
      }),
    [props.endDate, props.hotelSearchVenues, props.startDate, props.tournamentId, travelFallbackHref]
  );

  function trackHotelCtaClick(args: {
    href: string;
    travelMode: "direct" | "selector" | "fallback";
    selectedVenueId?: string | null;
    selectedVenueName?: string | null;
  }) {
    void trackTiEvent("tournament_detail_travel_search_clicked", {
      page_type: "tournament_detail",
      tournament_id: props.tournamentId,
      tournament_slug: slug,
      source_page: "tournament_detail",
      cta: "travel_search",
      href: args.href,
      hotel_search_mode: args.travelMode,
      hotel_search_linked_venue_count: props.hotelSearchVenues.length,
      selected_venue_id: args.selectedVenueId ?? undefined,
      selected_venue_name: args.selectedVenueName ?? undefined,
    });
  }

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
        {hotelSearchCta.mode === "selector" ? (
          <div className={styles.hotelSelectorWrap}>
            <button
              type="button"
              className={`secondaryLink ${styles.secondaryCta} ${styles.selectorButton}`}
              aria-expanded={hotelSelectorOpen}
              aria-controls={`hotel-selector-${props.tournamentId}`}
              onClick={() => {
                const nextOpen = !hotelSelectorOpen;
                setHotelSelectorOpen(nextOpen);
                if (nextOpen && !selectorViewedRef.current) {
                  selectorViewedRef.current = true;
                  void trackTiEvent("tournament_detail_hotel_selector_viewed", {
                    page_type: "tournament_detail",
                    tournament_id: props.tournamentId,
                    tournament_slug: slug,
                    source_page: "tournament_detail",
                    selector_venue_count: hotelSearchCta.options.length,
                  });
                }
              }}
            >
              Find tournament hotels
            </button>
            {hotelSelectorOpen ? (
              <div id={`hotel-selector-${props.tournamentId}`} className={styles.hotelSelectorPanel}>
                <div className={styles.hotelSelectorHeading}>Choose a venue to search nearby hotels</div>
                <div className={styles.hotelSelectorList}>
                  {hotelSearchCta.options.map((option) => (
                    <Link
                      key={option.id}
                      className={styles.hotelSelectorOption}
                      href={option.href}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      onClick={() => {
                        void trackTiEvent("tournament_detail_hotel_selector_venue_selected", {
                          page_type: "tournament_detail",
                          tournament_id: props.tournamentId,
                          tournament_slug: slug,
                          source_page: "tournament_detail",
                          selected_venue_id: option.id,
                          selected_venue_name: option.name,
                          selector_venue_count: hotelSearchCta.options.length,
                          href: option.href,
                        });
                        trackHotelCtaClick({
                          href: option.href,
                          travelMode: "selector",
                          selectedVenueId: option.id,
                          selectedVenueName: option.name,
                        });
                      }}
                    >
                      <span className={styles.hotelSelectorOptionTitle}>
                        {option.name}
                        {option.isPrimary ? <span className={styles.hotelSelectorPrimaryBadge}>Primary venue</span> : null}
                      </span>
                      {option.locationLabel ? (
                        <span className={styles.hotelSelectorOptionMeta}>{option.locationLabel}</span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <Link
            className={`secondaryLink ${styles.secondaryCta}`}
            href={hotelSearchCta.mode === "direct" ? hotelSearchCta.href : travelFallbackHref}
            target={hotelSearchCta.mode === "direct" ? "_blank" : undefined}
            rel={hotelSearchCta.mode === "direct" ? "noopener noreferrer sponsored" : undefined}
            onClick={() => {
              const selectedVenue = hotelSearchCta.options[0] ?? null;
              trackHotelCtaClick({
                href: hotelSearchCta.mode === "direct" ? hotelSearchCta.href : travelFallbackHref,
                travelMode: hotelSearchCta.mode === "direct" ? "direct" : "fallback",
                selectedVenueId: selectedVenue?.id ?? null,
                selectedVenueName: selectedVenue?.name ?? null,
              });
            }}
          >
            Find tournament hotels
          </Link>
        )}
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
            <span className={styles.teamHotelCalloutHeadline}>
              {teamHotelCallout.headline}
              <span className={styles.srOnly}> Opens in a new tab.</span>
            </span>
            <span className={styles.teamHotelCalloutLabel}>{teamHotelCallout.label}</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
