export const RI_TRAVEL_SOURCE = "referee_travel" as const;
export const RI_TRAVEL_PAGE_TYPE = "referee" as const;
export const RI_TRAVEL_CUSTOM8 = "app:refereeinsights" as const;
export const MAX_TRAVEL_RESULTS = 20;

export type TravelMode = "generic" | "anchored";

export type TravelSearchInput = {
  destination?: string;
  venueId?: string;
  checkin?: string;
  checkout?: string;
};

export type ValidTravelSearch = {
  mode: TravelMode;
  destination: string | null;
  venueId: string | null;
  checkin: string;
  checkout: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseTravelSearchInput(input: TravelSearchInput):
  | { ok: true; value: ValidTravelSearch }
  | { ok: false; error: string } {
  const destination = typeof input.destination === "string" ? input.destination.trim().replace(/\s+/g, " ") : "";
  const venueId = typeof input.venueId === "string" ? input.venueId.trim() : "";
  const checkin = typeof input.checkin === "string" ? input.checkin.trim() : "";
  const checkout = typeof input.checkout === "string" ? input.checkout.trim() : "";

  if (venueId && !UUID_RE.test(venueId)) return { ok: false, error: "Choose a valid venue." };
  if (!venueId && (!destination || destination.length > 180)) return { ok: false, error: "Enter a city, ZIP code, or destination." };
  if (!isIsoDate(checkin) || !isIsoDate(checkout) || checkout <= checkin) {
    return { ok: false, error: "Choose a valid check-in and check-out date." };
  }
  return {
    ok: true,
    value: {
      mode: venueId ? "anchored" : "generic",
      destination: venueId ? null : destination,
      venueId: venueId || null,
      checkin,
      checkout,
    },
  };
}

export type TravelHotel = {
  id: string;
  idTypeId: string;
  name: string;
  city: string | null;
  state: string | null;
  addressLine1: string | null;
  distanceMiles: number | null;
  rating: number | null;
  reviewCount: number | null;
  currency: string | null;
  fromPrice: number | null;
};

function text(value: unknown, max = 240) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeTravelHotel(value: unknown): TravelHotel | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id, 64);
  const name = text(row.name, 180);
  if (!id || !name) return null;
  return {
    id,
    idTypeId: String(number(row.hotelIDTypeID) ?? 0),
    name,
    city: text(row.city, 100),
    state: text(row.state, 40),
    addressLine1: text(row.addressLine1, 180),
    distanceMiles: number(row.distanceMiles),
    rating: number(row.rating),
    reviewCount: number(row.reviewCount),
    currency: text(row.currency, 8),
    fromPrice: number(row.fromPrice),
  };
}

export function buildTravelPropertyHandoff(args: {
  tiOrigin: string;
  hotel: TravelHotel;
  search: ValidTravelSearch;
  lodgingSearchId: string | null;
}) {
  const url = new URL("/go/hotels/property", args.tiOrigin);
  url.searchParams.set("hotelId", args.hotel.id);
  url.searchParams.set("idTypeId", args.hotel.idTypeId);
  url.searchParams.set("inDate", args.search.checkin);
  url.searchParams.set("outDate", args.search.checkout);
  url.searchParams.set("source", RI_TRAVEL_SOURCE);
  url.searchParams.set("request_source", RI_TRAVEL_SOURCE);
  url.searchParams.set("page_type", RI_TRAVEL_PAGE_TYPE);
  url.searchParams.set("flow_type", RI_TRAVEL_SOURCE);
  url.searchParams.set("cta_placement", "ri_travel_property_card");
  url.searchParams.set("page_url", "/travel");
  url.searchParams.set("custom8", RI_TRAVEL_CUSTOM8);
  if (args.search.venueId) url.searchParams.set("venueId", args.search.venueId);
  if (args.lodgingSearchId) url.searchParams.set("lodging_search_id", args.lodgingSearchId);
  return url.toString();
}
