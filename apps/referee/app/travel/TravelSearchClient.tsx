"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { captureRiEvent } from "@/lib/riAnalytics";
import styles from "./travel.module.css";

type VenueContext = { id: string; name: string; destinationLabel: string } | null;
type Hotel = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  addressLine1: string | null;
  distanceMiles: number | null;
  rating: number | null;
  reviewCount: number | null;
  currency: string | null;
  fromPrice: number | null;
  handoffUrl: string;
};

function isoDate(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function formatRate(value: number | null, currency: string | null) {
  if (value === null) return null;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(value);
  } catch {
    return `$${Math.round(value)}`;
  }
}

export default function TravelSearchClient({ venue }: { venue: VenueContext }) {
  const [destination, setDestination] = useState(venue?.destinationLabel || "");
  const [checkin, setCheckin] = useState(() => isoDate(14));
  const [checkout, setCheckout] = useState(() => isoDate(16));
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const mode = venue ? "anchored" : "generic";
  const analyticsProperties = useMemo(() => ({ mode, ...(venue ? { venue_id: venue.id } : {}) }), [mode, venue]);

  useEffect(() => {
    void captureRiEvent("ri_travel_page_viewed", { pageType: "travel", properties: analyticsProperties });
  }, [analyticsProperties]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setError("");
    void captureRiEvent("ri_travel_search_submitted", { pageType: "travel", properties: analyticsProperties });
    try {
      const response = await fetch("/api/travel/hotels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(venue ? { venueId: venue.id } : { destination }),
          checkin,
          checkout,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; hotels?: Hotel[] } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Hotel results are temporarily unavailable. Please try again.");
      const nextHotels = Array.isArray(payload.hotels) ? payload.hotels.slice(0, 20) : [];
      setHotels(nextHotels);
      setStatus("success");
      void captureRiEvent("ri_travel_results_returned", {
        pageType: "travel",
        properties: { ...analyticsProperties, result_count: nextHotels.length },
      });
    } catch (caught) {
      setHotels([]);
      setError(caught instanceof Error ? caught.message : "Hotel results are temporarily unavailable. Please try again.");
      setStatus("error");
    }
  }

  return (
    <section className={styles.searchPanel} aria-labelledby="travel-search-heading">
      <h2 id="travel-search-heading">Find a hotel</h2>
      {venue ? (
        <div className={styles.venueContext}>
          <strong>Near {venue.name}</strong>
          {venue.destinationLabel ? <span>{venue.destinationLabel}</span> : null}
          <Link href="/travel">Search another destination</Link>
        </div>
      ) : null}
      <form onSubmit={submit} className={styles.form}>
        {!venue ? (
          <label className={styles.destinationField}>
            Destination
            <input
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              maxLength={180}
              autoComplete="address-level2"
              placeholder="City, state, or ZIP code"
              required
            />
          </label>
        ) : null}
        <label>
          Check in
          <input type="date" value={checkin} min={isoDate(0)} onChange={(event) => setCheckin(event.target.value)} required />
        </label>
        <label>
          Check out
          <input type="date" value={checkout} min={checkin || isoDate(1)} onChange={(event) => setCheckout(event.target.value)} required />
        </label>
        <button type="submit" disabled={status === "loading"}>{status === "loading" ? "Searching…" : "Search hotels"}</button>
      </form>

      <div aria-live="polite" aria-busy={status === "loading"}>
        {status === "loading" ? <p className={styles.status}>Finding available hotels…</p> : null}
        {status === "error" ? <div className={styles.error} role="alert"><p>{error}</p><button type="button" onClick={() => setStatus("idle")}>Try again</button></div> : null}
        {status === "success" && hotels.length === 0 ? <p className={styles.empty}>No hotels matched this search. Try another destination or different dates.</p> : null}
        {hotels.length > 0 ? (
          <div className={styles.results}>
            <div className={styles.resultsHeader}><h2>Available hotels</h2><span>{hotels.length} results</span></div>
            <div className={styles.grid}>
              {hotels.map((hotel) => {
                const rate = formatRate(hotel.fromPrice, hotel.currency);
                return (
                  <article key={`${hotel.id}-${hotel.name}`} className={styles.card}>
                    <div>
                      <h3>{hotel.name}</h3>
                      <p>{[hotel.addressLine1, hotel.city, hotel.state].filter(Boolean).join(", ")}</p>
                      <p className={styles.facts}>
                        {hotel.distanceMiles !== null ? `${hotel.distanceMiles.toFixed(1)} mi away` : "Distance unavailable"}
                        {hotel.rating !== null ? ` · ${hotel.rating.toFixed(1)} rating` : ""}
                        {hotel.reviewCount !== null ? ` (${hotel.reviewCount} reviews)` : ""}
                      </p>
                    </div>
                    <div className={styles.cardAction}>
                      <span>{rate ? <><strong>{rate}</strong> / night</> : "Check rates"}</span>
                      <a href={hotel.handoffUrl} target="_blank" rel="noopener noreferrer sponsored">View rooms</a>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
