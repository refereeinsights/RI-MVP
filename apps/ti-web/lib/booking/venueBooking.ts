export function isValidZip5(zip: string | null | undefined): boolean {
  const value = String(zip ?? "").trim();
  return /^\d{5}$/.test(value);
}

export function canShowBookingCta(venue: { zip?: string | null } | null | undefined): boolean {
  return isValidZip5(venue?.zip);
}

function isValidState2(state: string | null | undefined): boolean {
  const value = String(state ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(value);
}

function looksLikeGenericRegionCity(value: string | null | undefined): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const normalized = raw.toLowerCase();
  const tokens = ["front range", "metro", "region", "area", "county"];
  return tokens.some((t) => normalized.includes(t));
}

function extractCityFromVenueName(name: string | null | undefined): string | null {
  const raw = String(name ?? "").trim();
  if (!raw) return null;
  const parts = raw.split(/[^a-zA-Z]+/g).filter(Boolean);
  const stop = new Set([
    "the",
    "a",
    "an",
    "youth",
    "sports",
    "sport",
    "complex",
    "park",
    "fields",
    "field",
    "center",
    "centre",
    "club",
    "academy",
    "high",
    "school",
    "middle",
    "elementary",
    "community",
  ]);
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (p.length < 3) continue;
    if (stop.has(lower)) continue;
    return p;
  }
  return null;
}

export function buildBookingSearchString(args: {
  venueName?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string | null {
  const cityRaw = String(args.city ?? "").trim();
  const zipRaw = String(args.zip ?? "").trim();
  const nameRaw = String(args.venueName ?? "").trim();
  const stateRaw = String(args.state ?? "").trim().toUpperCase();

  const zipOk = isValidZip5(zipRaw);
  const stateOk = isValidState2(stateRaw);

  const cityIsGenericRegion = looksLikeGenericRegionCity(cityRaw);
  const normalizedCity = cityIsGenericRegion ? extractCityFromVenueName(nameRaw) : null;
  const cityOk = Boolean((normalizedCity ?? cityRaw).trim());

  // Booking reliability order:
  // 1) City + State + ZIP
  // 2) City + State
  // 3) ZIP only (last resort)
  if (cityOk && stateOk && zipOk) return `${(normalizedCity ?? cityRaw).trim()}, ${stateRaw} ${zipRaw}`;
  if (cityOk && stateOk) return `${(normalizedCity ?? cityRaw).trim()}, ${stateRaw}`;
  if (zipOk) return zipRaw;

  return null;
}

type HotelUrlValue = string | number | null | undefined;

function addQueryNumber(qp: URLSearchParams, key: string, value: HotelUrlValue) {
  const raw = String(value ?? "").trim();
  if (!raw) return;
  const n = Number(raw);
  if (!Number.isFinite(n)) return;
  qp.set(key, String(n));
}

function parseCoordinate(value: HotelUrlValue, maxAbs: number) {
  const raw = String(value ?? "").trim();
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  if (Math.abs(num) > maxAbs) return null;
  return num;
}

export function buildHotelsHref(args: {
  venueId: string;
  tournamentId?: string | null;
  source?: string | null;
  provider?: string | null;
  ss?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
}): string {
  const qp = new URLSearchParams({ venueId: args.venueId });
  if (args.tournamentId) qp.set("tournamentId", args.tournamentId);
  if (args.source?.trim()) qp.set("source", args.source.trim());
  if (args.provider?.trim()) qp.set("provider", args.provider.trim());
  if (args.ss?.trim()) qp.set("ss", args.ss.trim());
  const lat = parseCoordinate(args.latitude, 90);
  const lng = parseCoordinate(args.longitude, 180);
  if (lat !== null && lng !== null) {
    addQueryNumber(qp, "lat", lat);
    addQueryNumber(qp, "lng", lng);
    addQueryNumber(qp, "latitude", lat);
    addQueryNumber(qp, "longitude", lng);
  }
  return `/go/hotels?${qp.toString()}`;
}
