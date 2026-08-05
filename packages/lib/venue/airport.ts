import type { AirportSummary, VenueAirportLookup } from "./types";

export type VenueAirportSelection = {
  airport: AirportSummary;
  sourceKind: "nearest_major_airport" | "nearest_airport";
};

export function selectVenueAirport(lookup: VenueAirportLookup | null | undefined): VenueAirportSelection | null {
  const nearestMajorAirport = lookup?.nearest_major_airport ?? null;
  if (nearestMajorAirport) {
    return { airport: nearestMajorAirport, sourceKind: "nearest_major_airport" };
  }

  const nearestAirport = lookup?.nearest_airport ?? null;
  if (nearestAirport) {
    return { airport: nearestAirport, sourceKind: "nearest_airport" };
  }

  return null;
}

export function buildVenueAirportQuery(airport: AirportSummary | null | undefined) {
  if (!airport) return null;
  const parts = [airport.name, airport.municipality, airport.iso_region, airport.iso_country]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim());
  return parts.length > 0 ? parts.join(", ") : null;
}

export function formatVenueAirportCode(airport: AirportSummary | null | undefined) {
  if (!airport) return null;
  const code = (airport.iata_code || airport.ident || "").trim();
  return code || null;
}

export function bucketVenueAirportDistance(distanceMiles: number | null | undefined) {
  if (typeof distanceMiles !== "number" || !Number.isFinite(distanceMiles) || distanceMiles < 0) return null;
  if (distanceMiles < 25) return "under_25";
  if (distanceMiles < 50) return "25_to_49";
  if (distanceMiles < 100) return "50_to_99";
  return "100_plus";
}
