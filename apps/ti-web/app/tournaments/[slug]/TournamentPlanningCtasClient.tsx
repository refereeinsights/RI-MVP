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

export default function TournamentPlanningCtasClient(props: {
  tournamentId: string;
  tournamentSlug: string;
  city: string | null;
  state: string | null;
  startDate: string | null;
  endDate: string | null;
}) {
  const slug = String(props.tournamentSlug ?? "").trim();
  if (!slug) return null;

  const mapHref = `/tournaments/${encodeURIComponent(slug)}/map`;
  const weekendHref = `/weekend/${encodeURIComponent(slug)}`;

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

  return (
    <div className="detailLinksRow" style={{ marginTop: 10, justifyContent: "center", gap: 10, flexWrap: "wrap" as any }}>
      <Link
        className="secondaryLink"
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
        className="secondaryLink"
        href={weekendHref}
        onClick={() => {
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
        Open weekend plan →
      </Link>
      <Link
        className="secondaryLink"
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
        Search travel →
      </Link>
    </div>
  );
}

