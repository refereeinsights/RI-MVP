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
  primaryVenueId?: string | null;
  owlPreviewCounts?: { food: number; coffee: number; quick_eats: number; hangouts: number; hotels: number } | null;
  planHasLodging?: boolean;
  city: string | null;
  state: string | null;
  startDate: string | null;
  endDate: string | null;
}) {
  const slug = String(props.tournamentSlug ?? "").trim();
  if (!slug) return null;

  const mapHref = `/tournaments/${encodeURIComponent(slug)}/map`;
  const weekendHref = (() => {
    const base = `/weekend/${encodeURIComponent(slug)}`;
    const primaryVenueId = String(props.primaryVenueId ?? "").trim();
    if (!primaryVenueId) return base;
    return `${base}?venue=${encodeURIComponent(primaryVenueId)}`;
  })();

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

  const chips: Array<{ key: string; label: string }> = [];
  const counts = props.owlPreviewCounts ?? null;
  if (counts) {
    if (counts.food > 0) chips.push({ key: "food", label: `${counts.food} food picks` });
    if (counts.quick_eats > 0) chips.push({ key: "quick_eats", label: `${counts.quick_eats} quick eats` });
    if (counts.coffee > 0) chips.push({ key: "coffee", label: `${counts.coffee} coffee spots` });
    if (counts.hangouts > 0) chips.push({ key: "hangouts", label: `${counts.hangouts} hangouts` });
  }

  const staysChip = (() => {
    if (props.planHasLodging) return { label: "Nearby stays", href: weekendHref };
    if (counts?.hotels && counts.hotels > 0) return { label: `${counts.hotels} stays`, href: weekendHref };
    if (String(props.city ?? "").trim() || String(props.state ?? "").trim()) return { label: "Find stays nearby", href: travelHref };
    return null;
  })();

  return (
    <div style={{ marginTop: 10, display: "grid", gap: 10, justifyItems: "center", textAlign: "center" }}>
      <div style={{ fontSize: 13, opacity: 0.92, maxWidth: 560 }}>
        Build a weekend plan with venue map, lodging, coffee, quick eats, restaurants, and parent hangouts.
      </div>

      <div className="detailLinksRow" style={{ marginTop: 0, justifyContent: "center", gap: 10, flexWrap: "wrap" as any }}>
        <Link
          className="primaryLink"
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
          Plan this tournament
        </Link>
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

      <div style={{ width: "min(640px, 100%)", marginTop: 2 }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.85 }}>
          Owl’s Eye Weekend Preview
        </div>
        {chips.length || staysChip ? (
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {chips.map((c) => (
              <span
                key={c.key}
                style={{
                  fontSize: 12,
                  fontWeight: 850,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                }}
              >
                {c.label}
              </span>
            ))}
            {staysChip ? (
              <a
                href={staysChip.href}
                className="secondaryLink"
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  textDecoration: "none",
                }}
              >
                {staysChip.label}
              </a>
            ) : null}
          </div>
        ) : (
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>
            Weekend planning options will appear when venue details are available.
          </div>
        )}
      </div>
    </div>
  );
}
