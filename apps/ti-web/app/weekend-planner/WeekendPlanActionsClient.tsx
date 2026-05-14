"use client";

import Link from "next/link";

function isValidIsoDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, m, d] = raw.split("-").map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(dt.getTime())) return false;
  return dt.toISOString().slice(0, 10) === raw;
}

export default function WeekendPlanActionsClient(props: {
  tournamentSlug: string;
  selectedVenueId: string | null;
  tournamentCity: string | null;
  tournamentState: string | null;
  tournamentStartDate: string | null;
  tournamentEndDate: string | null;
}) {
  const slug = String(props.tournamentSlug ?? "").trim();
  if (!slug) return null;

  const continueHref = props.selectedVenueId
    ? `/weekend/${encodeURIComponent(slug)}?venue=${encodeURIComponent(props.selectedVenueId)}`
    : `/weekend/${encodeURIComponent(slug)}`;
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
      <Link className="primaryLink" href={continueHref}>
        Continue plan →
      </Link>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Link className="secondaryLink" href={venueMapHref}>
          Venue map →
        </Link>
        <Link className="secondaryLink" href={travelHref}>
          Travel →
        </Link>
      </div>
    </div>
  );
}

