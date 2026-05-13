"use client";

import { useEffect, useMemo, useState } from "react";
import DirectionsChooserClient from "./DirectionsChooserClient";

type Airport = {
  id: string;
  name: string;
  municipality: string | null;
  iso_region: string | null;
  iso_country: string;
  iata_code: string | null;
  ident: string;
  latitude_deg: number;
  longitude_deg: number;
  distance_miles: number;
};

export default function WeekendNearestAirportClient(props: {
  venue: {
    id: string;
    name: string | null;
    city: string | null;
    state: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  tournament: {
    id: string;
    slug: string;
    name: string;
  };
  bookTravelHref: string;
}) {
  const hasCoords = typeof props.venue.latitude === "number" && typeof props.venue.longitude === "number";
  const [airport, setAirport] = useState<Airport | null>(null);

  const state = String(props.venue.state ?? "").trim();

  useEffect(() => {
    if (!hasCoords) return;
    let cancelled = false;
    const run = async () => {
      try {
        const url = new URL("/api/airports/nearest", window.location.origin);
        url.searchParams.set("lat", String(props.venue.latitude));
        url.searchParams.set("lng", String(props.venue.longitude));
        if (state) url.searchParams.set("state", state);
        const res = await fetch(url.toString(), { method: "GET" });
        const json = (await res.json()) as any;
        if (cancelled) return;
        if (json?.ok && json?.airport) setAirport(json.airport as Airport);
      } catch {
        // ignore
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [hasCoords, props.venue.latitude, props.venue.longitude, state]);

  const airportLabel = useMemo(() => {
    if (!airport) return null;
    const code = airport.iata_code || airport.ident;
    const codeLabel = code ? `(${code})` : "";
    const loc = [airport.municipality, airport.iso_region].filter(Boolean).join(", ");
    const dist = Number.isFinite(airport.distance_miles) ? `${airport.distance_miles.toFixed(1)} mi` : null;
    return [airport.name, codeLabel, loc].filter(Boolean).join(" • ") + (dist ? ` • ${dist}` : "");
  }, [airport]);

  if (!hasCoords) return null;

  return (
    <div style={{ marginTop: 8, padding: "12px 12px", borderRadius: 14, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}>Nearby airport</div>
      <div style={{ marginTop: 4, color: "#475569", fontWeight: 700, fontSize: 13 }}>
        {airportLabel ?? "Looking up the nearest airport…"}
      </div>

      {airport ? (
        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <DirectionsChooserClient
            label="Directions from airport"
            className="secondaryLink"
            title="Nearest airport"
            destinationLabel={airportLabel ?? "Nearest airport"}
            query={[airport.name, airport.municipality, airport.iso_region, airport.iso_country].filter(Boolean).join(", ")}
            coordinates={{ lat: airport.latitude_deg, lng: airport.longitude_deg }}
            copyText={[airport.name, airport.municipality, airport.iso_region, airport.iso_country].filter(Boolean).join(", ")}
            analytics={{
              event: "weekend_share_airport_directions_clicked",
              properties: {
                page_type: "weekend_share",
                tournament_id: props.tournament.id,
                tournament_slug: props.tournament.slug,
                venue_id: props.venue.id,
                venue_name: props.venue.name,
                source_page: "weekend_share",
                cta: "airport_directions",
                airport_id: airport.id,
                airport_name: airport.name,
                airport_iata: airport.iata_code,
              },
            }}
          />
          <a className="secondaryLink" href={props.bookTravelHref}>
            Travel search →
          </a>
        </div>
      ) : null}
    </div>
  );
}
