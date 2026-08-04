"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import { buildTeamHotelBookingHref } from "@/lib/teamHotelBooking";
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
  plannerSessionId: string;
  weekendHref: string;
  primaryVenueId?: string | null;
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
  const plannerSessionId = props.plannerSessionId;
  const weekendHref = props.weekendHref;
  const teamHotelHref = buildTeamHotelBookingHref({
    tournamentId: props.tournamentId,
    tournamentName: props.tournamentName ?? null,
    venueId: props.primaryVenueId ?? null,
    city: props.city,
    state: props.state,
    checkin: props.startDate,
    checkout: props.endDate,
    entrySource: "tournament_detail",
    entryPageType: "tournament",
    entryPath: `/tournaments/${encodeURIComponent(slug)}`,
    entryPlacement: "tournament_detail_team_hotel_cta",
  });
  const travelHref = (() => {
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

  useEffect(() => {
    if (viewedRef.current) return;
    if (!slug) return;
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
      venue_id: props.primaryVenueId ?? undefined,
    });
  }, [props.authState, props.entitlement]);

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
          href={travelHref}
          onClick={() => {
            void trackTiEvent("tournament_detail_travel_search_clicked", {
              page_type: "tournament_detail",
              tournament_id: props.tournamentId,
              tournament_slug: slug,
              source_page: "tournament_detail",
              cta: "travel_search",
              href: travelHref,
            });
          }}
        >
          Find hotels & travel →
        </Link>
      </div>

      <div className={styles.teamHotelRow}>
        <Link
          className={styles.teamHotelLink}
          href={teamHotelHref}
          onClick={() => {
            void trackTiEvent("team_hotel_cta_clicked", {
              surface: "tournament",
              source_page_type: "tournament",
              current_page_type: "tournament",
              current_page_path: typeof window !== "undefined" ? window.location.pathname : undefined,
              cta_type: "team_hotel",
              auth_state: props.authState,
              entitlement: props.entitlement,
              context_type: "team_hotel",
              tournament_id: props.tournamentId,
              venue_id: props.primaryVenueId ?? undefined,
              entry_source: "tournament_detail",
              entry_page_type: "tournament",
              entry_path: typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined,
              entry_placement: "tournament_detail_team_hotel_cta",
            });
          }}
        >
          Need rooms for the team? Request team hotel options →
        </Link>
      </div>
    </div>
  );
}
