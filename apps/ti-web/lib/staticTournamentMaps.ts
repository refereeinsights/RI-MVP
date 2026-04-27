import crypto from "crypto";

export const TI_STATIC_MAP_BUCKET = "ti-assets";
export const TI_STATIC_MAP_PREFIX = "tournament-static-maps";

export type StaticMapStatus = "missing" | "queued" | "processing" | "ready" | "error";

export type VenueCoordCandidate = {
  venueId: string;
  name?: string | null;
  latitude: number | null;
  longitude: number | null;
  isPrimary?: boolean | null;
};

export function isValidLatLng(latitude: unknown, longitude: unknown): latitude is number {
  const lat = typeof latitude === "number" ? latitude : Number(latitude);
  const lng = typeof longitude === "number" ? longitude : Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

export function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

function fmt6(n: number) {
  return round6(n).toFixed(6);
}

export function selectStaticMapMarkerCandidates(
  venues: VenueCoordCandidate[],
  maxMarkers: number
): Array<{ venueId: string; lat: number; lng: number }> {
  const valid = venues
    .filter((v) => isValidLatLng(v.latitude, v.longitude))
    .map((v) => ({
      venueId: v.venueId,
      lat: round6(v.latitude as number),
      lng: round6(v.longitude as number),
      isPrimary: Boolean(v.isPrimary),
      nameKey: String(v.name ?? "").trim().toLowerCase(),
    }));

  valid.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.nameKey !== b.nameKey) return a.nameKey.localeCompare(b.nameKey);
    return a.venueId.localeCompare(b.venueId);
  });

  const out: Array<{ venueId: string; lat: number; lng: number }> = [];
  const seen = new Set<string>();
  for (const v of valid) {
    const key = `${fmt6(v.lat)},${fmt6(v.lng)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ venueId: v.venueId, lat: v.lat, lng: v.lng });
    if (out.length >= maxMarkers) break;
  }
  return out;
}

export function computeStaticMapSourceHash(params: {
  coords: Array<{ lat: number; lng: number }>;
  style: string;
  width: number;
  height: number;
  markerStyle: string;
  maxMarkers: number;
  version: number;
}) {
  const coordsKey = params.coords
    .slice()
    .sort((a, b) => (a.lat - b.lat) || (a.lng - b.lng))
    .map((c) => `${fmt6(c.lat)},${fmt6(c.lng)}`)
    .join("|");

  const hashInput =
    coordsKey +
    `|style=${params.style}` +
    `|size=${params.width}x${params.height}` +
    `|marker=${params.markerStyle}` +
    `|maxMarkers=${params.maxMarkers}` +
    `|version=${params.version}`;

  return crypto.createHash("sha256").update(hashInput).digest("hex");
}

export function buildStaticMapStoragePath(tournamentId: string, hash: string) {
  return `${TI_STATIC_MAP_PREFIX}/${tournamentId}/${hash}.webp`;
}

export function buildSupabasePublicObjectUrl(params: {
  baseUrl: string;
  bucket: string;
  path: string;
}) {
  const root = (params.baseUrl ?? "").trim().replace(/\/+$/, "");
  const bucket = (params.bucket ?? "").trim();
  const path = (params.path ?? "").trim().replace(/^\/+/, "");
  if (!root || !bucket || !path) return null;
  return `${root}/storage/v1/object/public/${encodeURIComponent(bucket)}/${path
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/")}`;
}

export function buildMapboxStaticImageUrl(params: {
  style: string;
  width: number;
  height: number;
  coords: Array<{ lat: number; lng: number }>;
  markerColorHex: string;
  token: string;
  padding?: number;
  maxUrlLength?: number;
}) {
  const token = (params.token ?? "").trim();
  if (!token) return null;
  const style = (params.style ?? "").trim() || "mapbox/streets-v12";
  const padding = Number.isFinite(params.padding) ? Math.max(0, params.padding as number) : 40;
  const maxUrlLength = Number.isFinite(params.maxUrlLength) ? (params.maxUrlLength as number) : 7400;

  // Mapbox static marker format: pin-s+HEX(lon,lat)
  const color = (params.markerColorHex ?? "00AA55").replace("#", "");
  const markers = params.coords.map((c) => `pin-s+${color}(${fmt6(c.lng)},${fmt6(c.lat)})`);
  let overlay = markers.map((m) => encodeURIComponent(m)).join(",");

  // When overlays are too long, drop markers from the end (least important after stable sorting upstream).
  while (overlay.length > 0 && overlay.length > 5000 && overlay.split(",").length > 1) {
    const parts = overlay.split(",");
    parts.pop();
    overlay = parts.join(",");
  }

  const base = `https://api.mapbox.com/styles/v1/${style}/static/${overlay}/auto/${params.width}x${params.height}`;
  const url = `${base}?padding=${encodeURIComponent(String(padding))}&access_token=${encodeURIComponent(token)}`;
  if (url.length <= maxUrlLength) return url;

  // Second pass: more aggressive trimming to ensure we stay under typical URL length constraints.
  let parts = overlay.split(",");
  while (parts.length > 1) {
    parts = parts.slice(0, Math.ceil(parts.length * 0.8));
    const trimmed = parts.join(",");
    const u = `https://api.mapbox.com/styles/v1/${style}/static/${trimmed}/auto/${params.width}x${params.height}?padding=${encodeURIComponent(
      String(padding)
    )}&access_token=${encodeURIComponent(token)}`;
    if (u.length <= maxUrlLength) return u;
  }

  // If we still exceed, fall back to "auto" without overlays (caller should treat as error / fallback).
  return null;
}

