"use client";

import Link from "next/link";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

function isValidIsoDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, m, d] = raw.split("-").map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(dt.getTime())) return false;
  return dt.toISOString().slice(0, 10) === raw;
}

export default function SavedTournamentActionsClient(props: {
  tournamentId: string;
  tournamentSlug: string;
  tournamentCity: string | null;
  tournamentState: string | null;
  tournamentStartDate: string | null;
  tournamentEndDate: string | null;
}) {
  const slug = String(props.tournamentSlug ?? "").trim();
  if (!slug) return null;

  const openTournamentHref = `/tournaments/${encodeURIComponent(slug)}`;
  const weekendPlanHref = `/weekend/${encodeURIComponent(slug)}`;
  const venueMapHref = `/tournaments/${encodeURIComponent(slug)}/map`;

  const travelHref = (() => {
    const qp = new URLSearchParams();
    const city = String(props.tournamentCity ?? "").trim();
    const state = String(props.tournamentState ?? "").trim();
    if (city) qp.set("city", city);
    if (state) qp.set("state", state);
    if (isValidIsoDate(props.tournamentStartDate)) qp.set("checkin", String(props.tournamentStartDate));
    if (isValidIsoDate(props.tournamentEndDate)) qp.set("checkout", String(props.tournamentEndDate));
    const qs = qp.toString();
    return qs ? `/book-travel?${qs}` : "/book-travel";
  })();

  return (
    <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
      <Link
        className="primaryLink"
        href={openTournamentHref}
        onClick={() => {
          void trackTiEvent("weekend_planner_saved_tournament_clicked", {
            page_type: "weekend_planner",
            tournament_id: props.tournamentId,
            tournament_slug: slug,
            source_page: "weekend_planner",
            cta: "open_tournament",
            href: openTournamentHref,
          });
        }}
      >
        Open tournament →
      </Link>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Link
          className="secondaryLink"
          href={weekendPlanHref}
          onClick={() => {
            void trackTiEvent("weekend_planner_saved_weekend_plan_clicked", {
              page_type: "weekend_planner",
              tournament_id: props.tournamentId,
              tournament_slug: slug,
              source_page: "weekend_planner",
              cta: "weekend_plan",
              href: weekendPlanHref,
            });
          }}
        >
          Weekend plan →
        </Link>
        <Link
          className="secondaryLink"
          href={venueMapHref}
          onClick={() => {
            void trackTiEvent("weekend_planner_saved_venue_map_clicked", {
              page_type: "weekend_planner",
              tournament_id: props.tournamentId,
              tournament_slug: slug,
              source_page: "weekend_planner",
              cta: "venue_map",
              href: venueMapHref,
            });
          }}
        >
          Venue map →
        </Link>
        <Link
          className="secondaryLink"
          href={travelHref}
          onClick={() => {
            void trackTiEvent("weekend_planner_saved_travel_clicked", {
              page_type: "weekend_planner",
              tournament_id: props.tournamentId,
              tournament_slug: slug,
              source_page: "weekend_planner",
              cta: "travel",
              href: travelHref,
            });
          }}
        >
          Travel →
        </Link>
      </div>
    </div>
  );
}

