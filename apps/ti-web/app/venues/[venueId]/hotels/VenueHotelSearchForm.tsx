"use client";

import { useCallback, useRef, useState } from "react";

interface Props {
  venueId: string;
  venueName: string;
  latitude: number | null;
  longitude: number | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fireAnalytics(event: string, properties: Record<string, unknown>) {
  fetch("/api/analytics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [{ event, properties }] }),
  }).catch(() => undefined);
}

const S = {
  formRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "12px",
    alignItems: "flex-end",
    marginBottom: "8px",
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
    minWidth: "140px",
  },
  label: {
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: "var(--text-secondary, #6b7280)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  input: {
    padding: "8px 10px",
    border: "1px solid var(--border-color, #d1d5db)",
    borderRadius: "6px",
    fontSize: "0.9375rem",
    background: "var(--input-bg, #fff)",
    color: "var(--text-primary, #111)",
    outline: "none",
    minWidth: "0",
    width: "100%",
  },
  btn: {
    padding: "9px 22px",
    background: "#1a6c3f",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontSize: "0.9375rem",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  error: {
    color: "#c0392b",
    fontSize: "0.875rem",
    marginTop: "4px",
  },
};

export default function VenueHotelSearchForm({ venueId, venueName, latitude, longitude }: Props) {
  const today = todayIso();
  const defaultCheckin = addDays(today, 7);
  const defaultCheckout = addDays(defaultCheckin, 2);

  const [checkin, setCheckin] = useState(defaultCheckin);
  const [checkout, setCheckout] = useState(defaultCheckout);
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);

  const handleCheckinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setCheckin(value);
      setError(null);
      if (checkout <= value) {
        setCheckout(addDays(value, 2));
      }
    },
    [checkout]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!checkin || !checkout) {
        setError("Please select check-in and check-out dates.");
        return;
      }
      if (checkout <= checkin) {
        setError("Check-out must be after check-in.");
        return;
      }
      if (submitted.current) return;
      submitted.current = true;
      setError(null);

      fireAnalytics("venue_hotel_cta_clicked", { surface: "venue_hotel_seo" });

      const qp = new URLSearchParams({ venueId, source: "venue_hotel_seo", provider: "hotelplanner" });
      qp.set("checkin", checkin);
      qp.set("checkout", checkout);
      if (latitude !== null && longitude !== null) {
        qp.set("lat", String(latitude));
        qp.set("lng", String(longitude));
        qp.set("latitude", String(latitude));
        qp.set("longitude", String(longitude));
      }
      window.location.href = `/go/hotels?${qp.toString()}`;
    },
    [checkin, checkout, venueId, latitude, longitude]
  );

  return (
    <form onSubmit={handleSubmit} noValidate aria-label={`Search hotels near ${venueName}`}>
      <div style={S.formRow}>
        <div style={S.field}>
          <label htmlFor="vhf-checkin" style={S.label}>
            Check-in
          </label>
          <input
            id="vhf-checkin"
            type="date"
            style={S.input}
            value={checkin}
            min={today}
            onChange={handleCheckinChange}
            required
          />
        </div>

        <div style={S.field}>
          <label htmlFor="vhf-checkout" style={S.label}>
            Check-out
          </label>
          <input
            id="vhf-checkout"
            type="date"
            style={S.input}
            value={checkout}
            min={checkin ? addDays(checkin, 1) : addDays(today, 1)}
            onChange={(e) => {
              setCheckout(e.target.value);
              setError(null);
            }}
            required
          />
        </div>

        <button type="submit" style={S.btn}>
          Search hotels
        </button>
      </div>

      {error && (
        <p role="alert" style={S.error}>
          {error}
        </p>
      )}
    </form>
  );
}
