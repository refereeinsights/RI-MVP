import { buildHotelsHref, buildBookingSearchString } from "./booking/venueBooking";

export type TournamentHotelVenueInput = {
  id: string;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isPrimary?: boolean;
  createdAt?: string | null;
};

export type TournamentHotelVenueOption = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  locationLabel: string | null;
  href: string;
  isPrimary: boolean;
};

export type TournamentHotelSelectionResult = {
  mode: "fallback" | "direct" | "selector";
  href: string;
  options: TournamentHotelVenueOption[];
};

function cleanName(value: string | null | undefined) {
  const name = String(value ?? "").trim();
  return name || "Tournament venue";
}

function cleanCity(value: string | null | undefined) {
  const city = String(value ?? "").trim();
  return city || null;
}

function cleanState(value: string | null | undefined) {
  const state = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : null;
}

function isValidIsoDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [year, month, day] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(dt.getTime()) && dt.toISOString().slice(0, 10) === raw;
}

function addDaysIso(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function normalizedDates(startDate: string | null | undefined, endDate: string | null | undefined) {
  const checkin = isValidIsoDate(startDate) ? String(startDate).trim() : null;
  const checkoutRaw = isValidIsoDate(endDate) ? String(endDate).trim() : null;
  if (!checkin) return { checkin: null, checkout: null };
  if (!checkoutRaw) return { checkin, checkout: null };
  return {
    checkin,
    checkout: checkoutRaw <= checkin ? addDaysIso(checkin, 1) : checkoutRaw,
  };
}

function buildLocationLabel(city: string | null, state: string | null) {
  if (city && state) return `${city}, ${state}`;
  return city || state || null;
}

function byDeterministicVenueOrder(a: TournamentHotelVenueInput, b: TournamentHotelVenueInput) {
  const primaryDelta = Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary));
  if (primaryDelta !== 0) return primaryDelta;
  const createdA = String(a.createdAt ?? "");
  const createdB = String(b.createdAt ?? "");
  if (createdA && createdB && createdA !== createdB) return createdA.localeCompare(createdB);
  const nameDelta = cleanName(a.name).localeCompare(cleanName(b.name));
  if (nameDelta !== 0) return nameDelta;
  return String(a.id).localeCompare(String(b.id));
}

export function resolveTournamentHotelSearchCta(args: {
  tournamentId: string;
  startDate?: string | null;
  endDate?: string | null;
  fallbackHref: string;
  venues: TournamentHotelVenueInput[];
}) : TournamentHotelSelectionResult {
  const dates = normalizedDates(args.startDate ?? null, args.endDate ?? null);
  const options = args.venues
    .slice()
    .sort(byDeterministicVenueOrder)
    .map((venue) => {
      const city = cleanCity(venue.city);
      const state = cleanState(venue.state);
      const search = buildBookingSearchString({
        venueName: venue.name ?? null,
        city,
        state,
        zip: venue.zip ?? null,
      });
      if (!search) return null;
      return {
        id: venue.id,
        name: cleanName(venue.name),
        city,
        state,
        locationLabel: buildLocationLabel(city, state),
        href: buildHotelsHref({
          venueId: venue.id,
          tournamentId: args.tournamentId,
          source: "tournament_detail",
          provider: "hotelplanner",
          ss: search,
          latitude: venue.latitude ?? null,
          longitude: venue.longitude ?? null,
          checkin: dates.checkin,
          checkout: dates.checkout,
        }),
        isPrimary: Boolean(venue.isPrimary),
      } satisfies TournamentHotelVenueOption;
    })
    .filter((venue): venue is TournamentHotelVenueOption => Boolean(venue));

  if (options.length === 0) return { mode: "fallback", href: args.fallbackHref, options: [] };
  if (options.length === 1) return { mode: "direct", href: options[0].href, options };
  return { mode: "selector", href: args.fallbackHref, options };
}
