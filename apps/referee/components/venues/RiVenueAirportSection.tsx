"use client";

import { useEffect, useRef } from "react";
import MobileMapLink from "./MobileMapLink";
import { captureRiEvent } from "@/lib/riAnalytics";
import {
  buildVenueAirportQuery,
  bucketVenueAirportDistance,
  formatVenueAirportCode,
  type AirportSummary,
} from "../../../../packages/lib/venue";

type RiVenueAirportSectionProps = {
  venue: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
  };
  airport: AirportSummary;
  sourceKind: "nearest_major_airport" | "nearest_airport";
  linkedTournamentCount: number;
};

export default function RiVenueAirportSection({
  venue,
  airport,
  sourceKind,
  linkedTournamentCount,
}: RiVenueAirportSectionProps) {
  const viewedRef = useRef(false);
  const code = formatVenueAirportCode(airport);
  const query = buildVenueAirportQuery(airport);
  const location = [airport.municipality, airport.iso_region].filter(Boolean).join(", ");
  const distanceLabel =
    typeof airport.distance_miles === "number" && Number.isFinite(airport.distance_miles)
      ? `Approximately ${airport.distance_miles} miles from the venue`
      : null;
  const heading = sourceKind === "nearest_major_airport" ? "Airport for Longer-Distance Travel" : "Closest Airport";
  const distanceBucket = bucketVenueAirportDistance(airport.distance_miles);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    void captureRiEvent("ri_venue_airport_viewed", {
      pageType: "venue_detail",
      properties: {
        site: "refereeinsights",
        venue_id: venue.id,
        venue_name: venue.name,
        venue_city: venue.city ?? null,
        venue_state: venue.state ?? null,
        city: venue.city ?? null,
        state: venue.state ?? null,
        source_page: "venue_detail_airport",
        source_page_type: "venue_detail",
        airport_name: airport.name,
        airport_code: code,
        airport_city: airport.municipality ?? null,
        airport_source_kind: sourceKind,
        distance_bucket: distanceBucket,
        linked_tournament_count: linkedTournamentCount,
      },
    });
  }, [airport.municipality, airport.name, code, distanceBucket, linkedTournamentCount, sourceKind, venue.city, venue.id, venue.name, venue.state]);

  if (!query) return null;

  return (
    <div className="detailCard" style={{ width: "min(720px, 100%)", display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>{heading}</div>
        <div style={{ fontWeight: 700, color: "#0f172a" }}>
          {airport.name}
          {code ? ` (${code})` : ""}
        </div>
        {location ? <div style={{ color: "#475569", fontSize: 14 }}>{location}</div> : null}
        {distanceLabel ? <div style={{ color: "#475569", fontSize: 14 }}>{distanceLabel}</div> : null}
      </div>

      <div className="detailLinksRow">
        <MobileMapLink
          provider="google"
          query={query}
          fallbackHref={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`}
          className="secondaryLink"
          onClick={() => {
            void captureRiEvent("ri_venue_airport_directions_clicked", {
              pageType: "venue_detail",
              properties: {
                site: "refereeinsights",
                venue_id: venue.id,
                venue_name: venue.name,
                venue_city: venue.city ?? null,
                venue_state: venue.state ?? null,
                city: venue.city ?? null,
                state: venue.state ?? null,
                source_page: "venue_detail_airport",
                source_page_type: "venue_detail",
                airport_name: airport.name,
                airport_code: code,
                airport_city: airport.municipality ?? null,
                airport_source_kind: sourceKind,
                distance_bucket: distanceBucket,
                linked_tournament_count: linkedTournamentCount,
                target_kind: "airport_directions_google",
              },
            });
          }}
        >
          Get directions
        </MobileMapLink>
      </div>
    </div>
  );
}
