"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ENABLE_WEEKEND_PLANNER_DIRECT_ENTRY } from "@/lib/featureFlags";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import { buildPlannerHref, buildTournamentPlannerEntryHref, createPlannerSessionId } from "@/lib/planner/plannerSession";
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
  primaryVenueId?: string | null;
  city: string | null;
  state: string | null;
  startDate: string | null;
  endDate: string | null;
  authState: "signed_out" | "unverified" | "verified";
  entitlement: "explorer" | "insider" | "weekend_pro" | "unknown";
}) {
  const slug = String(props.tournamentSlug ?? "").trim();
  const viewedRef = useRef(false);
  const plannerSessionIdRef = useRef<string>("");
  if (!plannerSessionIdRef.current) plannerSessionIdRef.current = createPlannerSessionId();

  const mapHref = `/tournaments/${encodeURIComponent(slug)}/map`;
  const legacyPlannerEntry = buildTournamentPlannerEntryHref(`/weekend/${encodeURIComponent(slug)}`, {
    planner_session_id: plannerSessionIdRef.current,
    venue_id: props.primaryVenueId,
    source: "tournament_detail",
  });
  const plannerSessionId = legacyPlannerEntry.plannerSessionId;
  const weekendHref = ENABLE_WEEKEND_PLANNER_DIRECT_ENTRY
    ? buildPlannerHref("/weekend-planner", {
        planner_session_id: plannerSessionId,
        tournament_id: props.tournamentId,
        tournament_slug: slug,
        tournament_name: String(props.tournamentName ?? "").trim() || null,
        tournament_start_date: isValidIsoDate(props.startDate) ? String(props.startDate) : null,
        tournament_end_date: isValidIsoDate(props.endDate) ? String(props.endDate) : null,
        venue_id: props.primaryVenueId ?? null,
        entry_source: "tournament_detail",
        entry_page_type: "tournament",
        entry_path: `/tournaments/${encodeURIComponent(slug)}`,
        entry_placement: "tournament_detail_planner_cta",
        current_page_type: "planner",
        current_page_path: "/weekend-planner",
        request_source: "planner_resume",
      })
    : legacyPlannerEntry.href;
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
            });
            void trackTiEvent("tournament_detail_weekend_plan_clicked", {
              page_type: "tournament_detail",
              tournament_id: props.tournamentId,
              tournament_slug: slug,
              source_page: "tournament_detail",
              cta: "weekend_plan",
              href: weekendHref,
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
          href="/book-travel#team-hotel-blocks"
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
            });
          }}
        >
          Need rooms for the team? Request team hotel options →
        </Link>
      </div>
    </div>
  );
}
