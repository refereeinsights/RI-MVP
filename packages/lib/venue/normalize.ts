import type { SharedVenue, SharedVenueSourceRow, SharedVenueTournamentSummary } from "./types";

const STREET_TOKENS = new Set([
  "st",
  "street",
  "ave",
  "avenue",
  "rd",
  "road",
  "dr",
  "drive",
  "blvd",
  "boulevard",
  "ln",
  "lane",
  "ct",
  "court",
  "way",
  "pkwy",
  "parkway",
  "pl",
  "place",
  "cir",
  "circle",
  "ter",
  "terrace",
  "hwy",
  "highway",
]);

const US_STATE_CODES = new Set(
  [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
  ].sort()
);

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeCoordinate(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function hasValidVenueCoordinates(latitude: number | null | undefined, longitude: number | null | undefined) {
  return typeof latitude === "number" && typeof longitude === "number" && Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function hasHotelSearchCityState(city: string | null, state: string | null) {
  return Boolean(city && state);
}

export function formatVenueAddress(parts: {
  address: string | null | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
  zip: string | null | undefined;
}) {
  const pieces = [normalizeText(parts.address), normalizeText(parts.city), normalizeText(parts.state), normalizeText(parts.zip)].filter(Boolean);
  return pieces.length > 0 ? pieces.join(", ") : null;
}

function tournamentSortValue(tournament: SharedVenueTournamentSummary, todayIso: string) {
  const start = tournament.startDate ?? "";
  const end = tournament.endDate ?? "";
  const isUpcoming = Boolean((start && start >= todayIso) || (end && end >= todayIso));
  const hasDate = Boolean(start || end);
  return {
    bucket: isUpcoming ? 0 : hasDate ? 1 : 2,
    start: start || "9999-12-31",
    end: end || "9999-12-31",
    name: tournament.name ?? "",
  };
}

export function sortSharedVenueTournaments(tournaments: SharedVenueTournamentSummary[], now = new Date()) {
  const todayIso = now.toISOString().slice(0, 10);
  return [...tournaments].sort((left, right) => {
    const leftValue = tournamentSortValue(left, todayIso);
    const rightValue = tournamentSortValue(right, todayIso);
    if (leftValue.bucket !== rightValue.bucket) return leftValue.bucket - rightValue.bucket;
    if (leftValue.start !== rightValue.start) return leftValue.start.localeCompare(rightValue.start);
    if (leftValue.end !== rightValue.end) return leftValue.end.localeCompare(rightValue.end);
    return leftValue.name.localeCompare(rightValue.name);
  });
}

export function buildSharedVenueFromRow(row: SharedVenueSourceRow, now = new Date()): SharedVenue {
  const addressLine1 = normalizeText(row.address);
  const city = normalizeText(row.city);
  const state = normalizeText(row.state);
  const postalCode = normalizeText(row.zip);
  const formattedAddress = formatVenueAddress({
    address: addressLine1,
    city,
    state,
    zip: postalCode,
  });
  const latitude = normalizeCoordinate(row.latitude);
  const longitude = normalizeCoordinate(row.longitude);
  const coordinatesValid = hasValidVenueCoordinates(latitude, longitude);

  const tournaments = sortSharedVenueTournaments(
    (row.tournament_venues ?? [])
      .filter((join) => !join?.is_inferred)
      .map((join) => join?.tournaments)
      .filter((tournament): tournament is NonNullable<typeof tournament> => Boolean(tournament?.id))
      .map((tournament) => ({
        id: tournament.id,
        slug: normalizeText(tournament.slug),
        name: normalizeText(tournament.name),
        sport: normalizeText(tournament.sport),
        city: normalizeText(tournament.city),
        state: normalizeText(tournament.state),
        startDate: normalizeText(tournament.start_date),
        endDate: normalizeText(tournament.end_date),
      })),
    now
  );

  const routeKey = normalizeText(row.seo_slug) ?? row.id;
  const destinationLabel = normalizeText(row.name) ?? formattedAddress ?? "Venue";
  const addressReady = Boolean(formattedAddress);
  const mapReady = coordinatesValid;
  const hotelSearchReady = Boolean(row.id) && (coordinatesValid || hasHotelSearchCityState(city, state));
  const hotelSearchNotReadyReason = hotelSearchReady ? null : coordinatesValid ? null : hasHotelSearchCityState(city, state) ? null : addressReady ? "no_city_state" : "no_coordinates";

  return {
    id: row.id,
    routeKey,
    seoSlug: normalizeText(row.seo_slug),
    name: normalizeText(row.name),
    address: {
      line1: addressLine1,
      city,
      state,
      postalCode,
      formatted: formattedAddress,
    },
    coordinates: {
      latitude,
      longitude,
      valid: coordinatesValid,
    },
    notes: normalizeText(row.notes),
    venueUrl: normalizeText(row.venue_url),
    sport: normalizeText(row.sport),
    reviewAverages: {
      restroomCleanliness: row.restroom_cleanliness_avg ?? null,
      shade: row.shade_score_avg ?? null,
      vendors: row.vendor_score_avg ?? null,
      parkingConvenience: row.parking_convenience_score_avg ?? null,
    },
    reviewCount: row.review_count ?? null,
    reviewsLastUpdatedAt: normalizeText(row.reviews_last_updated_at),
    tournaments,
    directions: {
      destinationLabel,
      destinationAddress: formattedAddress,
      destinationLatitude: latitude,
      destinationLongitude: longitude,
    },
    readiness: {
      addressReady,
      mapReady,
      hotelSearchReady,
      hotelSearchNotReadyReason,
      nearbyEnrichmentReady: row.id ? coordinatesValid || hasHotelSearchCityState(city, state) : null,
    },
  };
}

export function parseLegacyVenueAddressSlug(param: string): { state: string; number: string; keyword: string | null } | null {
  const raw = param.trim().toLowerCase();
  if (!raw || raw.length > 140) return null;
  if (!/^\d{1,6}-[a-z0-9-]{3,140}-[a-z]{2}$/.test(raw)) return null;
  const parts = raw.split("-").filter(Boolean);
  if (parts.length < 4) return null;
  const number = parts[0] ?? "";
  const stateRaw = (parts[parts.length - 1] ?? "").toUpperCase();
  if (!/^\d{1,6}$/.test(number)) return null;
  if (!US_STATE_CODES.has(stateRaw)) return null;
  const body = parts.slice(1, -1);
  const hasStreetSignal = body.some((part) => STREET_TOKENS.has(part));
  if (!hasStreetSignal) return null;
  const keyword =
    body.find((part) => part.length >= 4 && !STREET_TOKENS.has(part) && !/^\d+$/.test(part) && !["of", "the", "and", "at", "in"].includes(part)) ??
    null;
  return { state: stateRaw, number, keyword };
}

export function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}
