export const CAMPSPOT_AWIN_ADVERTISER_ID = "22326";
export const CAMPSPOT_AWIN_AFFILIATE_ID = "2854179";

export const CAMPSPOT_SOURCE_SURFACES = ["venue_detail", "venue_map"] as const;
export type CampspotSourceSurface = (typeof CAMPSPOT_SOURCE_SURFACES)[number];

export const CAMPSPOT_CTA_PLACEMENTS = {
  venueDetail: "venue_detail_camping",
  venueMap: "venue_map_camping",
} as const;
export type CampspotCtaPlacement = (typeof CAMPSPOT_CTA_PLACEMENTS)[keyof typeof CAMPSPOT_CTA_PLACEMENTS];

const SOURCE_PLACEMENTS: Record<CampspotSourceSurface, CampspotCtaPlacement> = {
  venue_detail: CAMPSPOT_CTA_PLACEMENTS.venueDetail,
  venue_map: CAMPSPOT_CTA_PLACEMENTS.venueMap,
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ATTRIBUTION_ID_RE = /^[0-9a-f]{32}$/;

function cleanText(value: string | null | undefined, maxLength = 80) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function parseIsoDate(value: string | null | undefined) {
  const text = cleanText(value, 10);
  if (!text || !ISO_DATE_RE.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : null;
}

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function isValidCampspotCoordinates(latitude: unknown, longitude: unknown) {
  const lat = typeof latitude === "number" ? latitude : Number(String(latitude ?? "").trim());
  const lng = typeof longitude === "number" ? longitude : Number(String(longitude ?? "").trim());
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function hasValidCampspotDestination(input: {
  city?: string | null;
  state?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
}) {
  return Boolean(
    cleanText(input.city) &&
      cleanText(input.state) &&
      isValidCampspotCoordinates(input.latitude, input.longitude),
  );
}

export function normalizeCampspotDatePair(input: {
  checkin?: string | null;
  checkout?: string | null;
}) {
  const checkin = parseIsoDate(input.checkin);
  const checkout = parseIsoDate(input.checkout);
  if (!checkin && !checkout) return null;
  if (!checkin || !checkout || checkout <= checkin) return null;
  return { checkin, checkout };
}

export function deriveCampspotTournamentDates(input: {
  startDate?: string | null;
  endDate?: string | null;
  todayIso?: string;
}) {
  const startDate = parseIsoDate(input.startDate);
  if (!startDate) return null;

  const todayIso = parseIsoDate(input.todayIso) ?? new Date().toISOString().slice(0, 10);
  const rawEndDate = parseIsoDate(input.endDate);
  const endDate = rawEndDate && rawEndDate >= startDate ? rawEndDate : startDate;
  if (endDate < todayIso) return null;

  const checkin = startDate < todayIso ? todayIso : startDate;
  const checkout = addDays(endDate, 1);
  const nights = Math.round((Date.parse(`${checkout}T00:00:00Z`) - Date.parse(`${checkin}T00:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(nights) || nights <= 0 || nights > 14) return null;
  return { checkin, checkout };
}

export function buildCampspotUrl(input: {
  city: string;
  stateName: string;
  latitude: number;
  longitude: number;
  checkin?: string | null;
  checkout?: string | null;
}) {
  const city = cleanText(input.city);
  const stateName = cleanText(input.stateName);
  if (!city || !stateName || !isValidCampspotCoordinates(input.latitude, input.longitude)) {
    throw new Error("Valid Campspot destination context is required.");
  }

  const params = new URLSearchParams({
    location: `${city}, ${stateName}`,
    latitude: String(Number(input.latitude)),
    longitude: String(Number(input.longitude)),
    adults: "2",
    children: "0",
    pets: "0",
  });
  const dates = normalizeCampspotDatePair({ checkin: input.checkin, checkout: input.checkout });
  if (dates) {
    params.set("checkin", dates.checkin);
    params.set("checkout", dates.checkout);
  }

  return `https://www.campspot.com/search?${params.toString()}`;
}

export function createCampspotAttributionId(factory?: () => string) {
  const value = String(factory?.() ?? globalThis.crypto?.randomUUID?.() ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "");
  if (!ATTRIBUTION_ID_RE.test(value)) throw new Error("Unable to generate Campspot attribution ID.");
  return value;
}

export function buildCampspotAffiliateUrl(input: {
  campspotUrl: string;
  outboundAttributionId: string;
}) {
  const destination = new URL(input.campspotUrl);
  if (destination.protocol !== "https:" || destination.hostname !== "www.campspot.com" || destination.pathname !== "/search") {
    throw new Error("Invalid Campspot affiliate destination.");
  }
  const outboundAttributionId = String(input.outboundAttributionId ?? "").trim().toLowerCase();
  if (!ATTRIBUTION_ID_RE.test(outboundAttributionId)) throw new Error("Invalid Campspot attribution ID.");

  const params = new URLSearchParams({
    awinmid: CAMPSPOT_AWIN_ADVERTISER_ID,
    awinaffid: CAMPSPOT_AWIN_AFFILIATE_ID,
    clickref: outboundAttributionId,
    ued: destination.toString(),
  });
  return `https://www.awin1.com/cread.php?${params.toString()}`;
}

export function isCampspotSourceSurface(value: string): value is CampspotSourceSurface {
  return (CAMPSPOT_SOURCE_SURFACES as readonly string[]).includes(value);
}

export function isCampspotPlacement(value: string): value is CampspotCtaPlacement {
  return (Object.values(CAMPSPOT_CTA_PLACEMENTS) as string[]).includes(value);
}

export function isValidCampspotSourcePlacement(source: string, placement: string) {
  return isCampspotSourceSurface(source) && isCampspotPlacement(placement) && SOURCE_PLACEMENTS[source] === placement;
}

export function buildCampingHref(input: {
  venueId: string;
  tournamentId?: string | null;
  sourceSurface: CampspotSourceSurface;
  ctaPlacement: CampspotCtaPlacement;
}) {
  if (!isValidCampspotSourcePlacement(input.sourceSurface, input.ctaPlacement)) {
    throw new Error("Invalid Campspot source/placement combination.");
  }
  const params = new URLSearchParams({
    venue_id: input.venueId,
    source_surface: input.sourceSurface,
    cta_placement: input.ctaPlacement,
  });
  if (input.tournamentId) params.set("tournament_id", input.tournamentId);
  return `/go/camping?${params.toString()}`;
}
