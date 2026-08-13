export type TournamentHotelsDateSource =
  | "tournament"
  | "booking_safe_fallback"
  | "unavailable"
  | "user_adjusted";

export type TournamentHotelsVenue = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  isPrimary: boolean;
  order: number;
};

export type TournamentHotelsSeoInput = {
  status?: string | null;
  name: string | null;
  city: string | null;
  state: string | null;
  startDate: string | null;
  venues: Array<Pick<TournamentHotelsVenue, "latitude" | "longitude">>;
};

export function nullableFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isValidHotelSearchCoordinates(latitude: unknown, longitude: unknown) {
  const lat = typeof latitude === "number" ? latitude : Number(latitude);
  const lng = typeof longitude === "number" ? longitude : Number(longitude);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat !== 0 &&
    lng !== 0 &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function searchableTournamentHotelVenues(venues: TournamentHotelsVenue[]) {
  return venues.filter((venue) => isValidHotelSearchCoordinates(venue.latitude, venue.longitude));
}

export function selectInitialTournamentHotelVenue(venues: TournamentHotelsVenue[]) {
  const searchable = searchableTournamentHotelVenues(venues);
  return searchable.find((venue) => venue.isPrimary) ?? searchable[0] ?? null;
}

function parseIsoDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === raw ? date : null;
}

export function isoDateInUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addUtcDays(isoDate: string, days: number) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return null;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return isoDateInUtc(parsed);
}

export function tournamentHotelsSeoEligible(input: TournamentHotelsSeoInput, now = new Date()) {
  if (input.status && input.status !== "published") return false;
  if (!String(input.name ?? "").trim()) return false;
  if (!String(input.city ?? "").trim() && !String(input.state ?? "").trim()) return false;
  const start = parseIsoDate(input.startDate);
  if (!start) return false;
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  if (start < cutoff) return false;
  return input.venues.some((venue) => isValidHotelSearchCoordinates(venue.latitude, venue.longitude));
}

export function initialTournamentHotelDates(
  input: { startDate: string | null; endDate: string | null },
  now = new Date()
): { checkin: string; checkout: string; source: Exclude<TournamentHotelsDateSource, "user_adjusted" | "unavailable"> } {
  const today = isoDateInUtc(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
  const start = parseIsoDate(input.startDate);
  const end = parseIsoDate(input.endDate);

  if (start && isoDateInUtc(start) >= today) {
    const checkin = isoDateInUtc(start);
    const validEnd = end && end >= start ? isoDateInUtc(end) : checkin;
    return {
      checkin,
      checkout: addUtcDays(validEnd, 1) ?? checkin,
      source: "tournament",
    };
  }

  if (start && end && start < parseIsoDate(today)! && end >= parseIsoDate(today)!) {
    const endPlusOne = addUtcDays(isoDateInUtc(end), 1)!;
    const maxCheckout = addUtcDays(today, 3)!;
    return {
      checkin: today,
      checkout: endPlusOne <= maxCheckout ? endPlusOne : maxCheckout,
      source: "booking_safe_fallback",
    };
  }

  const checkin = addUtcDays(today, 14)!;
  return {
    checkin,
    checkout: addUtcDays(checkin, 2)!,
    source: "booking_safe_fallback",
  };
}

export function mmDdYyyyToIso(value: string | null | undefined) {
  const match = String(value ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, month, day, year] = match;
  return parseIsoDate(`${year}-${month}-${day}`) ? `${year}-${month}-${day}` : null;
}

export function formatTournamentDateRange(startDate: string | null, endDate: string | null) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const format = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
  if (start && end && isoDateInUtc(start) !== isoDateInUtc(end)) return `${format(start)} – ${format(end)}`;
  if (start) return format(start);
  if (end) return format(end);
  return "Dates unavailable";
}
