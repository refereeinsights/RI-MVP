import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import crypto from "crypto";

import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import SelectAllOnPage from "./SelectAllOnPage";
import { renderGeneratedMapPng, sha256Hex, uploadGeneratedMapToStorage } from "@/lib/maps/generatedFieldMaps";
import { fetchVenuePoiHints } from "@/lib/maps/venuePoiHints";
import { fetchVenuePitchCenter, recommendZoomFromPitchBbox } from "@/lib/maps/venuePitchCenter";

export const runtime = "nodejs";

type QueueStatus = "pending" | "suggested" | "manual_review" | "approved" | "applied" | "skipped" | "error";

type QueueRow = {
  venue_id: string;
  status: QueueStatus;
  bad_venue_url_reason: string | null;
  current_venue_url: string | null;
  current_field_map_url: string | null;
  suggested_venue_url: string | null;
  suggested_field_map_url: string | null;
  suggested_field_map_source: string | null;
  suggested_field_map_confidence: string | null;
  suggested_field_map_type: string | null;
  suggested_field_map_sport?: string | null;
  suggested_field_map_set_primary?: boolean | null;
  applied_field_map_id?: number | null;
  generated_map_object_path?: string | null;
  generated_map_url?: string | null;
  generated_map_hash?: string | null;
  generated_map_version?: string | null;
  generated_map_source?: string | null;
  approve_generated_map?: boolean | null;
  generated_map_applied_id?: number | null;
  generation_attempt_count?: number | null;
  generation_error?: string | null;
  generated_at?: string | null;
  poi_hints_json?: any | null;
  poi_hints_source?: string | null;
  poi_hints_fetched_at?: string | null;
  poi_hints_error?: string | null;
  approve_venue_url: boolean | null;
  approve_field_map_url: boolean | null;
  override_good_venue_url: boolean | null;
  notes: string | null;
  updated_at: string | null;
  venues: {
    id: string;
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    latitude?: number | null;
    longitude?: number | null;
    venue_url: string | null;
    field_map_url: string | null;
    venue_url_quality: string | null;
  } | null;
};

type SearchEngine = "brave" | "google";
type DiscoverMode = "broad" | "strict";

function inferDiscoverIndicator(notes: string | null) {
  const text = (notes ?? "").trim();
  if (!text) return null;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const lastDiscover = [...lines].reverse().find((l) => l.startsWith("[discover:"));
  if (!lastDiscover) return null;

  // examples:
  // [discover:brave] no match (brave_http_429) for "..."
  // [discover:brave] no match for "..."
  // [discover:brave] errored (brave_http_429) for "..."
  // [discover:brave] picked (55) https://...
  const match = lastDiscover.match(/^\[discover:([a-z]+)\]\s+(no match|picked|errored)/i);
  if (!match) return null;
  const engine = match[1].toLowerCase();
  const kind = match[2].toLowerCase();
  if (kind === "no match") return { engine, label: `no ${engine} match`, tone: "warn" as const };
  if (kind === "errored") return { engine, label: `${engine} error`, tone: "warn" as const };
  if (kind === "picked") return { engine, label: `${engine} match`, tone: "ok" as const };
  return null;
}

function redirectWithNotice(base: string, notice: string): never {
  const joiner = base.includes("?") ? "&" : "?";
  redirect(`${base}${joiner}notice=${encodeURIComponent(notice)}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function maybeFetchAndStorePoiHints(params: { venueId: string; lat: number; lng: number }) {
  const enabled = String(process.env.ENABLE_VENUE_POI_HINTS || "").toLowerCase() === "true";
  if (!enabled) return { ok: false, summary: null as string | null };

  try {
    const hints = await fetchVenuePoiHints({ lat: params.lat, lon: params.lng, radiusMeters: 650 });
    const { error } = await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .update({
        poi_hints_json: hints as any,
        poi_hints_source: hints.source,
        poi_hints_fetched_at: new Date().toISOString(),
        poi_hints_error: null,
      })
      .eq("venue_id", params.venueId);
    if (error) console.warn("field-maps poi hints: store failed", { venueId: params.venueId, error });

    const counts = (hints?.counts ?? {}) as Record<string, number>;
    const top = Object.entries(counts)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 6)
      .map(([k, v]) => `${k}=${v}`)
      .join(" • ");
    const summary = top ? `[poi_hints:${hints.source}] ${top}` : `[poi_hints:${hints.source}] ok`;
    return { ok: true, summary };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "poi_hints_failed";
    await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .update({
        poi_hints_fetched_at: new Date().toISOString(),
        poi_hints_error: msg,
      })
      .eq("venue_id", params.venueId);
    return { ok: false, summary: `[poi_hints] errored (${msg})` };
  }
}

function normalizeToken(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isLikelyUsStateCode(state: string | null | undefined) {
  const s = String(state ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s);
}

function haversineDistanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371e3; // meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function validateVenueCoordinates(params: {
  venueId: string;
  lat: number;
  lng: number;
  venueAddress?: string | null;
  venueCity?: string | null;
  venueState?: string | null;
  venueZip?: string | null;
}) {
  const enabled = String(process.env.ENABLE_VENUE_COORD_VALIDATION || "").toLowerCase() === "true";
  if (!enabled) return { severity: "ok" as const };

  const { lat, lng, venueAddress, venueCity, venueState, venueZip } = params;

  // Basic sanity.
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { severity: "hard" as const, reason: "coords_missing" as const };
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { severity: "hard" as const, reason: "coords_out_of_range" as const };
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return { severity: "hard" as const, reason: "coords_zero" as const };

  // If it looks like a US venue, apply a coarse US bounding box check.
  if (isLikelyUsStateCode(venueState)) {
    const usOk = lat >= 18 && lat <= 72 && lng >= -170 && lng <= -50;
    if (!usOk) return { severity: "hard" as const, reason: "coords_outside_us_bbox" as const };
  }

  // Optional Mapbox checks. We keep these conservative to avoid false positives for large multi-field complexes.
  const token = String(process.env.MAPBOX_ACCESS_TOKEN || "").trim();
  if (!token) return { severity: "ok" as const };

  const expectedState = String(venueState ?? "").trim().toUpperCase() || null;
  const expectedCity = String(venueCity ?? "").trim() || null;

  let reversePlaceName: string | null = null;
  let inferredState: string | null = null;
  let inferredCity: string | null = null;

  try {
    // Reverse geocode at the stored coordinates; used only as a soft signal.
    {
      const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`);
      url.searchParams.set("access_token", token);
      url.searchParams.set("types", "place,region,country,postcode");
      url.searchParams.set("limit", "1");

      const res = await fetch(url.toString(), { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as any;
        const feat = Array.isArray(json?.features) ? json.features[0] : null;
        if (feat) {
          reversePlaceName = String(feat.place_name ?? "").trim() || null;
          const ctx = Array.isArray(feat.context) ? feat.context : [];
          const region = ctx.find((c: any) => String(c.id ?? "").startsWith("region.")) ?? null;
          const place = ctx.find((c: any) => String(c.id ?? "").startsWith("place.")) ?? null;

          inferredState =
            String(region?.short_code ?? "")
              .toUpperCase()
              .split("-")
              .pop()
              ?.trim() || null;
          inferredCity = String(place?.text ?? "").trim() || null;
        }
      }
    }

    // Forward geocode the venue's address and compare to stored coords. This is the primary mismatch signal.
    // (Still conservative: we only hard-fail on very large gaps.)
    const qParts = [venueAddress, venueCity, expectedState, venueZip].map((v) => String(v ?? "").trim()).filter(Boolean);
    if (qParts.length >= 2) {
      const q = qParts.join(", ");
      const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`);
      url.searchParams.set("access_token", token);
      url.searchParams.set("limit", "1");
      url.searchParams.set("autocomplete", "false");
      url.searchParams.set("types", "address,poi,place");
      if (isLikelyUsStateCode(expectedState)) url.searchParams.set("country", "us");

      const res = await fetch(url.toString(), { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as any;
        const feat = Array.isArray(json?.features) ? json.features[0] : null;
        const center = Array.isArray(feat?.center) ? feat.center : null;
        const expLng = Number(center?.[0]);
        const expLat = Number(center?.[1]);
        const expPlace = String(feat?.place_name ?? "").trim() || null;
        if (Number.isFinite(expLat) && Number.isFinite(expLng)) {
          const dist = haversineDistanceMeters({ lat, lng }, { lat: expLat, lng: expLng });
          if (dist > 50_000) {
            return {
              severity: "hard" as const,
              reason: "addr_distance_gt_50km" as const,
              details: `distance_m=${Math.round(dist)} expected=${expLat.toFixed(6)},${expLng.toFixed(6)}${expPlace ? ` mapbox_addr=${expPlace}` : ""}${
                reversePlaceName ? ` mapbox_rev=${reversePlaceName}` : ""
              }`,
              inferredState,
              inferredCity,
              reversePlaceName,
            };
          }
          if (dist > 10_000) {
            return {
              severity: "soft" as const,
              reason: "addr_distance_gt_10km" as const,
              details: `distance_m=${Math.round(dist)} expected=${expLat.toFixed(6)},${expLng.toFixed(6)}${expPlace ? ` mapbox_addr=${expPlace}` : ""}${
                reversePlaceName ? ` mapbox_rev=${reversePlaceName}` : ""
              }`,
              inferredState,
              inferredCity,
              reversePlaceName,
            };
          }
        }
      }
    }

    // If we couldn't forward-geocode, fall back to reverse-only soft signals.
    if (expectedState && inferredState && expectedState !== inferredState) {
      return {
        severity: "soft" as const,
        reason: "reverse_state_mismatch" as const,
        details: `${expectedState}!=${inferredState}${reversePlaceName ? ` mapbox_rev=${reversePlaceName}` : ""}`,
        inferredState,
        inferredCity,
        reversePlaceName,
      };
    }
    if (expectedCity && inferredCity) {
      const a = normalizeToken(expectedCity);
      const b = normalizeToken(inferredCity);
      const overlaps = a && b && (a.includes(b) || b.includes(a));
      if (!overlaps) {
        return {
          severity: "soft" as const,
          reason: "reverse_city_mismatch" as const,
          details: `${expectedCity}!=${inferredCity}${reversePlaceName ? ` mapbox_rev=${reversePlaceName}` : ""}`,
          inferredState,
          inferredCity,
          reversePlaceName,
        };
      }
    }

    return { severity: "ok" as const, inferredState, inferredCity, reversePlaceName };
  } catch {
    return { severity: "ok" as const };
  }
}

async function maybeRecenterOnOsmPitches(params: { lat: number; lng: number; fallbackZoom: number }) {
  const enabled = String(process.env.ENABLE_OSM_PITCH_CENTERING || "").toLowerCase() === "true";
  if (!enabled) return { used: false as const, centerLat: params.lat, centerLng: params.lng, zoom: params.fallbackZoom, pitchCount: 0 };

  try {
    const radii = [1200, 2200, 4000, 8000];
    for (const radiusMeters of radii) {
      const r = await fetchVenuePitchCenter({ lat: params.lat, lon: params.lng, radiusMeters });
      if (!r.ok) continue;
      if (!r.pitchCount || !r.center) continue;
      const zoom = recommendZoomFromPitchBbox({ bbox: r.bbox ?? null, fallbackZoom: params.fallbackZoom });
      return { used: true as const, centerLat: r.center.lat, centerLng: r.center.lng, zoom, pitchCount: r.pitchCount };
    }
    return { used: false as const, centerLat: params.lat, centerLng: params.lng, zoom: params.fallbackZoom, pitchCount: 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "pitch_center_failed";
    return { used: false as const, centerLat: params.lat, centerLng: params.lng, zoom: params.fallbackZoom, pitchCount: 0, error: msg as string };
  }
}

function normalizeUrlForHash(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  url.hash = "";
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  const trackingPrefixes = ["utm_"];
  const trackingKeys = new Set(["fbclid", "gclid"]);
  const kept: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => {
    const k = key.toLowerCase();
    if (trackingKeys.has(k)) return;
    if (trackingPrefixes.some((p) => k.startsWith(p))) return;
    kept.push([key, value]);
  });
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  url.search = "";
  for (const [k, v] of kept) url.searchParams.append(k, v);

  return url.toString();
}

function hashUrlSha256Hex(raw: string) {
  const normalized = normalizeUrlForHash(raw);
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function safeUrlHost(raw: string) {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isBlockedDiscoveryHost(host: string) {
  const h = host.toLowerCase().trim();
  if (!h) return true;
  const blockedHosts = [
    "tournamentinsights.com",
    "www.tournamentinsights.com",
    "google.com",
    "www.google.com",
    "maps.google.com",
    "maps.app.goo.gl",
    "goo.gl",
    "maps.apple.com",
    "waze.com",
    "www.waze.com",
  ];
  if (blockedHosts.includes(h)) return true;
  if (/(yelp|facebook|tripadvisor|opentable|wikipedia)\./i.test(h)) return true;
  return false;
}

function scoreMapCandidate(
  input: { url: string; title?: string | null; snippet?: string | null },
  opts?: { preferredHost?: string | null }
) {
  const url = input.url.trim();
  const host = safeUrlHost(url) ?? "";
  const title = (input.title ?? "").toLowerCase();
  const snippet = (input.snippet ?? "").toLowerCase();
  const preferredHost = (opts?.preferredHost ?? null)?.toLowerCase() ?? null;
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();

  const blob = `${title} ${snippet} ${path}`;

  // Reject obvious non-venue content.
  if (isBlockedDiscoveryHost(host)) return { score: -999, kind: "blocked" as const };
  if (blob.includes("/venues/") && host.includes("tournamentinsights")) return { score: -999, kind: "blocked" as const };

  // Reject generic XML sitemaps (common false positive when querying "site map").
  // Keep "site-map" image/PDF maps eligible; only block the canonical sitemap document patterns.
  const isXmlSitemap =
    /(^|\/)sitemap(_index)?\.xml$/i.test(path) ||
    /(^|\/)wp-sitemap\.xml$/i.test(path) ||
    /sitemap.*\.xml$/i.test(path);
  if (isXmlSitemap) return { score: -999, kind: "blocked" as const };

  // Business rule: ignore parking maps (they're usually not field/court layouts).
  const isParkingMap =
    /\bparking\s*map\b/i.test(blob) ||
    /parking[-_ ]?map/i.test(blob) ||
    (path.includes("parking") && /map/i.test(path));
  if (isParkingMap) return { score: -999, kind: "blocked" as const };

  let score = 0;

  const isPdf = path.endsWith(".pdf") || url.toLowerCase().includes(".pdf");
  const isImage = /\.(png|jpg|jpeg|webp)$/i.test(path);
  const looksLikeLocationMap = /\blocation\s*(and|&)\s*map\b/i.test(blob) || /\bdirections\s*(and|&)\s*map\b/i.test(blob);
  const looksLikeFieldMapSlug =
    /\/field-?map(\/|$)/i.test(path) ||
    /\/maps?\/field/i.test(path) ||
    /\/facility-?map(\/|$)/i.test(path) ||
    /\/complex-?map(\/|$)/i.test(path);
  const looksLikeMap =
    /field\s*map|facility\s*map|complex\s*map|campus\s*map|court\s*map|gym\s*map|park\s*map|parking\s*map|field\s*layout|court\s*layout/i.test(blob) ||
    ((/\bsite\s*map\b/i.test(blob) || /site[-_ ]?map/i.test(path)) && /field|court|gym|facility|complex|campus|layout/i.test(blob)) ||
    looksLikeLocationMap ||
    looksLikeFieldMapSlug ||
    /map(\.|\/|_|-)/i.test(path);
  const hasSportsTokens = /field|fields|court|courts|gym|complex|facility|park|parking|layout|site/i.test(blob);

  if (isPdf) score += 35;
  if (isImage) score += 20;
  if (looksLikeMap) score += 20;
  if (hasSportsTokens) score += 10;
  if (looksLikeLocationMap) score += 10;
  if (looksLikeFieldMapSlug) score += 14;

  // Strong signals for common map endpoints.
  if (/(facility[-_ ]?maps?|site[-_ ]?map|field[-_ ]?map|complex[-_ ]?map|campus[-_ ]?map|park[-_ ]?map|parking[-_ ]?map)/i.test(blob)) {
    score += 10;
  }

  // Prefer results hosted on the venue's own domain when we have it.
  if (preferredHost) {
    if (host === preferredHost) score += 18;
    else if (host.endsWith(`.${preferredHost}`) || preferredHost.endsWith(`.${host}`)) score += 10;
  }

  if (/\bpark(s)?\b|\brecreation\b|\bparks\b|\bschools\b|\bathletics\b|\bdistrict\b|\bcity\b|\bcounty\b/.test(host)) score += 6;
  if (host.endsWith(".gov")) score += 8;
  if (host.endsWith(".edu")) score += 8;

  // Penalize likely generic directories.
  if (/(yelp|facebook|tripadvisor|opentable|wikipedia)\./i.test(host)) score -= 18;

  return { score, kind: isPdf || isImage ? ("artifact" as const) : ("page" as const) };
}

function isStrictEligible(candidate: { url: string; title?: string | null; snippet?: string | null }) {
  const url = candidate.url.toLowerCase();
  const title = (candidate.title ?? "").toLowerCase();
  const snippet = (candidate.snippet ?? "").toLowerCase();
  const blob = `${url} ${title} ${snippet}`;
  const isPdfOrImage = url.includes(".pdf") || /\.(png|jpg|jpeg|webp)(\\?|$)/i.test(url);
  const isLocationMapPage =
    blob.includes("location and map") ||
    blob.includes("location & map") ||
    blob.includes("directions and map") ||
    blob.includes("directions & map");
  const isFieldMapSlug =
    blob.includes("/field-map") ||
    blob.includes("/fieldmap") ||
    blob.includes("/facility-map") ||
    blob.includes("/complex-map");
  const keyword =
    blob.includes("field map") ||
    blob.includes("facility map") ||
    blob.includes("complex map") ||
    blob.includes("court map") ||
    blob.includes("gym map") ||
    blob.includes("park map") ||
    blob.includes("field layout") ||
    blob.includes("court layout");
  return isPdfOrImage || keyword || isLocationMapPage || isFieldMapSlug;
}

function maybeAddFiletypePdf(raw: string) {
  const q = raw.trim();
  if (!q) return q;
  const lower = q.toLowerCase();
  if (lower.includes("filetype:pdf")) return q;
  if (/\bpdf\b/i.test(q)) return `${q} filetype:pdf`;
  return q;
}

function pickHostCandidateFromResults(results: Array<{ url: string }>) {
  for (const r of results) {
    const host = safeUrlHost(r.url);
    if (!host) continue;
    if (isBlockedDiscoveryHost(host)) continue;
    return host;
  }
  return null;
}

function inferMapTypeFromUrl(raw: string) {
  const s = raw.toLowerCase();
  if (s.includes("parking")) return "parking_map";
  if (s.includes("court") || s.includes("gym")) return "indoor_court_map";
  if (s.includes("field") && (s.includes("number") || s.includes("field-") || s.includes("fields"))) return "field_numbering";
  if (s.includes("campus")) return "campus_map";
  if (s.includes("complex") || s.includes("layout") || s.includes("facility")) return "complex_layout";
  if (s.includes("map")) return "general_facility_map";
  return "unknown";
}

function inferConfidence(candidate: { url: string; title?: string | null; snippet?: string | null }) {
  const scored = scoreMapCandidate(candidate);
  if (scored.score >= 55) return "high";
  if (scored.score >= 35) return "medium";
  if (scored.score >= 20) return "low";
  return null;
}

async function braveSearch(params: { q: string; count: number }) {
  const token = (process.env.BRAVE_SEARCH_KEY ?? process.env.BRAVE_SEARCH_API_KEY ?? "").trim();
  if (!token) return { error: "missing_brave_key", results: [] as any[] };

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", params.q);
  url.searchParams.set("count", String(Math.max(1, Math.min(10, params.count))));

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": token,
    },
    cache: "no-store",
  });

  if (!res.ok) return { error: `brave_http_${res.status}`, results: [] as any[] };
  const json: any = await res.json();
  const results = (json?.web?.results ?? []).map((r: any) => ({
    url: r.url as string,
    title: (r.title ?? null) as string | null,
    snippet: (r.description ?? null) as string | null,
  }));
  return { error: null as string | null, results };
}

async function googleCseSearch(params: { q: string; count: number }) {
  const key = process.env.GOOGLE_CSE_API_KEY?.trim();
  const cx = process.env.GOOGLE_CSE_CX?.trim();
  if (!key || !cx) return { error: "missing_google_cse_key", results: [] as any[] };

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", params.q);
  url.searchParams.set("num", String(Math.max(1, Math.min(10, params.count))));

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return { error: `google_http_${res.status}`, results: [] as any[] };
  const json: any = await res.json();
  const results = (json?.items ?? []).map((r: any) => ({
    url: r.link as string,
    title: (r.title ?? null) as string | null,
    snippet: (r.snippet ?? null) as string | null,
  }));
  return { error: null as string | null, results };
}

function canUseGoogleCse() {
  const key = process.env.GOOGLE_CSE_API_KEY?.trim();
  const cx = process.env.GOOGLE_CSE_CX?.trim();
  return Boolean(key && cx);
}

function clampInt(value: string | null, fallback: number, min: number, max: number) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isLikelySchoolVenueName(name: string | null | undefined) {
  const s = String(name ?? "").toLowerCase();
  if (!s) return false;
  return s.includes("middle school") || s.includes("elementary");
}

export default async function VenueFieldMapsQueuePage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    status?: QueueStatus | "all";
    limit?: string;
    offset?: string;
    notice?: string;
  };
}) {
  await requireAdmin();

  const q = (searchParams?.q ?? "").trim();
  const status = (searchParams?.status ?? "pending") as QueueStatus | "all";
  const limit = clampInt(searchParams?.limit ?? null, 25, 1, 200);
  const offset = clampInt(searchParams?.offset ?? null, 0, 0, 50_000);
  const notice = (searchParams?.notice ?? "").trim();

  const basePath = "/admin/venues/field-maps";
  const engine = ((searchParams as any)?.engine ?? "brave") as SearchEngine;
  const discoverMode = ((searchParams as any)?.discover_mode ?? "broad") as DiscoverMode;

  async function fetchAllPaged<T = any>(fetchPage: (from: number, to: number) => Promise<any>, pageSize = 1000) {
    const all: T[] = [];
    for (let from = 0; from < 100_000_000; from += pageSize) {
      const to = from + pageSize - 1;
      const { data, error } = (await fetchPage(from, to)) as { data: T[] | null; error: any };
      if (error) return { data: all, error };
      const page = data ?? [];
      all.push(...page);
      if (page.length < pageSize) break;
    }
    return { data: all, error: null };
  }

  async function computeVenueFieldMapCoverage() {
    // Any failure here should not block the queue UI.
    try {
      const { data: mapVenueRows, error: mapVenueErr } = await fetchAllPaged(async (from, to) => {
        return await supabaseAdmin.from("venue_field_maps" as any).select("venue_id").range(from, to);
      });
      if (mapVenueErr) throw mapVenueErr;
      const venueIdsWithMultiMaps = new Set((mapVenueRows ?? []).map((r) => String((r as any).venue_id)).filter(Boolean));

      const { data: skippedRows, error: skippedErr } = await fetchAllPaged(async (from, to) => {
        return await supabaseAdmin.from("venue_url_review_queue" as any).select("venue_id").eq("status", "skipped").range(from, to);
      });
      if (skippedErr) throw skippedErr;
      const explicitlySkipped = new Set((skippedRows ?? []).map((r) => String((r as any).venue_id)).filter(Boolean));

      let total = 0;
      let withMaps = 0;
      let withoutMapsNotSkipped = 0;

      const { error: venuesScanErr } = await fetchAllPaged(async (from, to) => {
        return await supabaseAdmin.from("venues" as any).select("id,name,field_map_url").range(from, to);
      }).then(({ data, error }) => {
        if (error) return { error };
        for (const v of (data ?? []) as any[]) {
          const id = String(v.id);
          total += 1;
          const hasMap = Boolean(String(v.field_map_url ?? "").trim()) || venueIdsWithMultiMaps.has(id);
          if (hasMap) {
            withMaps += 1;
            continue;
          }

          const isExcluded = explicitlySkipped.has(id) || isLikelySchoolVenueName(v.name);
          if (!isExcluded) withoutMapsNotSkipped += 1;
        }
        return { error: null };
      });
      if (venuesScanErr) throw venuesScanErr;

      return { total, withMaps, withoutMapsNotSkipped };
    } catch (e) {
      console.error("field-maps: coverage stats failed", e);
      return null as null | { total: number; withMaps: number; withoutMapsNotSkipped: number };
    }
  }

  const coverage = await computeVenueFieldMapCoverage();

  async function computeQueueStatusCounts() {
    try {
      const { data: rows, error: statusErr } = await fetchAllPaged(async (from, to) => {
        return await supabaseAdmin.from("venue_url_review_queue" as any).select("status").range(from, to);
      }, 2000);
      if (statusErr) throw statusErr;

      const counts: Record<string, number> = {};
      for (const r of (rows ?? []) as any[]) {
        const s = String((r as any).status ?? "");
        if (!s) continue;
        counts[s] = (counts[s] ?? 0) + 1;
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return { counts, total };
    } catch (e) {
      console.error("field-maps: queue status counts failed", e);
      return { counts: {} as Record<string, number>, total: null as number | null };
    }
  }

  const queueStatusCounts = await computeQueueStatusCounts();

  const schemaHelp = {
    title: "Field map queue schema not deployed yet",
    body: [
      "Apply these Supabase migrations:",
      "- `supabase/migrations/20260422_ti_venue_url_cleanup_field_maps_queue.sql`",
      "- `supabase/migrations/20260422_ti_venue_field_maps_multi.sql`",
      "- `supabase/migrations/20260423_ti_generated_field_maps_v1.sql`",
      "",
      "Then reload PostgREST's schema cache (Supabase SQL editor): `NOTIFY pgrst, 'reload schema';`",
    ].join("\n"),
  };

  const buildHref = (overrides: Record<string, string | null | undefined>) => {
    const params = new URLSearchParams();
    const nextQ = overrides.q ?? q;
    const nextStatus = overrides.status ?? status;
    const nextLimit = overrides.limit ?? String(limit);
    const nextOffset = overrides.offset ?? String(offset);
    const nextEngine = overrides.engine ?? engine;
    const nextDiscoverMode = overrides.discover_mode ?? discoverMode;

    if (nextQ) params.set("q", nextQ);
    if (nextStatus && nextStatus !== "pending") params.set("status", nextStatus);
    if (nextLimit && nextLimit !== "25") params.set("limit", nextLimit);
    if (nextOffset && nextOffset !== "0") params.set("offset", nextOffset);
    if (nextEngine && nextEngine !== "brave") params.set("engine", nextEngine);
    if (nextDiscoverMode && nextDiscoverMode !== "broad") params.set("discover_mode", nextDiscoverMode);
    return `${basePath}${params.toString() ? `?${params.toString()}` : ""}`;
  };

  async function quickPasteImpl(formData: FormData, mode: "approve" | "apply") {
    "use server";
    const admin = await requireAdmin();
    const redirectTo = String(formData.get("redirect_to") || basePath);
    const venueId = String(formData.get("venue_id") || "").trim();
    const mapUrl = String(formData.get("map_url") || "").trim();
    const sport = String(formData.get("sport") || "").trim() || null;
    const setPrimary = formData.get("set_primary") === "on";

    if (!venueId) return redirectWithNotice(redirectTo, "Venue id missing.");
    if (!mapUrl) return redirectWithNotice(redirectTo, "Paste a map URL first.");

    // Ensure queue row exists + snapshot current venue values.
    const { data: venue, error: venueErr } = await supabaseAdmin
      .from("venues" as any)
      .select("id,venue_url,field_map_url")
      .eq("id", venueId)
      .maybeSingle();
    if (venueErr || !venue) {
      console.error("field-maps quick paste: venue load failed", { venueId, venueErr });
      return redirectWithNotice(redirectTo, "Venue not found.");
    }

    const { data: existingQueue, error: existingQueueErr } = await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .select("notes")
      .eq("venue_id", venueId)
      .maybeSingle();
    if (existingQueueErr) {
      console.warn("field-maps quick paste: existing queue lookup failed", { venueId, existingQueueErr });
    }

    const mapType = inferMapTypeFromUrl(mapUrl);
    const confidence = inferConfidence({ url: mapUrl, title: null, snippet: null });
    const nextNotes = [
      String((existingQueue as any)?.notes ?? "").trim(),
      `[${new Date().toISOString()}] [manual_paste] ${mapUrl}${sport ? ` (sport=${sport})` : ""}${setPrimary ? " (primary)" : ""}`,
    ]
      .filter(Boolean)
      .join("\n");

    const { error: upsertErr } = await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .upsert(
        {
          venue_id: venueId,
          status: "approved",
          current_venue_url: (venue as any).venue_url ?? null,
          current_field_map_url: (venue as any).field_map_url ?? null,
          suggested_field_map_url: mapUrl,
          suggested_field_map_source: "manual_paste",
          suggested_field_map_confidence: confidence,
          suggested_field_map_type: mapType,
          suggested_field_map_sport: sport,
          suggested_field_map_set_primary: setPrimary,
          approve_field_map_url: true,
          reviewed_by: admin.id,
          last_reviewed_at: new Date().toISOString(),
          notes: nextNotes,
        },
        { onConflict: "venue_id" }
      );

    if (upsertErr) {
      console.error("field-maps quick paste: queue upsert failed", { venueId, upsertErr });
      return redirectWithNotice(redirectTo, "Failed to save queue row.");
    }

    if (mode !== "apply") {
      revalidatePath(basePath);
      return redirectWithNotice(redirectTo, "Saved + approved (ready to apply).");
    }

    // Apply immediately: insert into venue_field_maps and optionally set primary.
    const mapHash = hashUrlSha256Hex(mapUrl);
    let appliedMapId: number | null = null;
    if (mapHash) {
      const { data: existingRaw, error: existingErr } = await supabaseAdmin
        .from("venue_field_maps" as any)
        .select("id")
        .eq("venue_id", venueId)
        .eq("map_hash", mapHash)
        .maybeSingle();
      if (existingErr) {
        console.error("field-maps quick apply: existing map lookup failed", { venueId, existingErr });
      } else if ((existingRaw as any)?.id) {
        appliedMapId = Number((existingRaw as any).id);
      }
    }

    if (!appliedMapId) {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("venue_field_maps" as any)
        .insert({
          venue_id: venueId,
          map_url: mapUrl,
          map_hash: mapHash,
          map_source: "manual_paste",
          map_confidence: confidence,
          map_type: mapType,
          sport,
          is_primary: false,
        })
        .select("id")
        .maybeSingle();
      if (insErr || !inserted) {
        console.error("field-maps quick apply: insert failed", { venueId, insErr });
        return redirectWithNotice(redirectTo, "Apply failed: could not insert map.");
      }
      appliedMapId = Number((inserted as any).id);
      await supabaseAdmin.from("venue_field_maps_audit_log" as any).insert({
        venue_id: venueId,
        event_type: "insert",
        map_id: appliedMapId,
        map_url: mapUrl,
        actor: admin.id,
        reason: "manual quick apply from admin queue",
      });
    }

    if (setPrimary) {
      await supabaseAdmin.from("venue_field_maps" as any).update({ is_primary: false }).eq("venue_id", venueId).eq("is_primary", true);
      await supabaseAdmin.from("venue_field_maps" as any).update({ is_primary: true }).eq("id", appliedMapId);
      await supabaseAdmin.from("venue_field_maps_audit_log" as any).insert({
        venue_id: venueId,
        event_type: "set_primary",
        map_id: appliedMapId,
        map_url: mapUrl,
        actor: admin.id,
        reason: "manual quick apply from admin queue",
      });

      // Cache back onto venues for legacy surfaces.
      const prevFieldMapUrl = (venue as any).field_map_url ?? null;
      const { error: venueUpdateErr } = await supabaseAdmin
        .from("venues" as any)
        .update({
          field_map_url: mapUrl,
          field_map_source: "manual_paste",
          field_map_confidence: confidence,
          field_map_type: mapType,
          field_map_hash: mapHash,
          field_map_last_checked_at: new Date().toISOString(),
        })
        .eq("id", venueId);
      if (venueUpdateErr) {
        console.error("field-maps quick apply: venue cache update failed", { venueId, venueUpdateErr });
      } else {
        await supabaseAdmin.from("venue_url_audit_log" as any).insert({
          venue_id: venueId,
          event_type: "apply",
          previous_venue_url: (venue as any).venue_url ?? null,
          new_venue_url: null,
          previous_field_map_url: prevFieldMapUrl,
          new_field_map_url: mapUrl,
          actor: admin.id,
          reason: "manual quick apply primary map from admin queue",
        });
      }
    }

    await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .update({ status: "applied", applied_field_map_id: appliedMapId })
      .eq("venue_id", venueId);

    revalidatePath(basePath);
    revalidatePath("/admin/venues");
    return redirectWithNotice(redirectTo, setPrimary ? "Applied (primary set)." : "Applied (map added).");
  }

  async function quickPasteApproveAction(formData: FormData) {
    "use server";
    return quickPasteImpl(formData, "approve");
  }

  async function quickPasteApplyAction(formData: FormData) {
    "use server";
    return quickPasteImpl(formData, "apply");
  }

  async function quickApproveSuggestedAction(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const redirectTo = String(formData.get("redirect_to") || basePath);
    const venueId = String(formData.get("venue_id") || "").trim();
    if (!venueId) return redirectWithNotice(redirectTo, "Venue id missing.");

    const { data: row, error: loadErr } = await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .select("venue_id,suggested_field_map_url,notes,status")
      .eq("venue_id", venueId)
      .maybeSingle();
    if (loadErr || !row) {
      console.error("field-maps quick approve: load failed", { venueId, loadErr });
      return redirectWithNotice(redirectTo, "Queue row not found.");
    }

    const suggested = String((row as any).suggested_field_map_url ?? "").trim();
    if (!suggested) return redirectWithNotice(redirectTo, "No suggested map URL to approve.");

    const now = new Date().toISOString();
    const priorNotes = String((row as any).notes ?? "").trim();
    const nextNotes = [priorNotes, `[${now}] approved suggested map (manual)`].filter(Boolean).join("\n");

    const { error: updErr } = await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .update({
        status: "approved",
        approve_field_map_url: true,
        reviewed_by: admin.id,
        last_reviewed_at: now,
        notes: nextNotes,
      })
      .eq("venue_id", venueId);
    if (updErr) {
      console.error("field-maps quick approve: update failed", { venueId, updErr });
      return redirectWithNotice(redirectTo, "Approve failed.");
    }

    revalidatePath(basePath);
    return redirectWithNotice(redirectTo, "Approved (ready to apply).");
  }

  async function quickMarkNotFoundAction(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const redirectTo = String(formData.get("redirect_to") || basePath);
    const venueId = String(formData.get("venue_id") || "").trim();
    if (!venueId) return redirectWithNotice(redirectTo, "Venue id missing.");

    const { data: row, error: loadErr } = await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .select("venue_id,notes,status")
      .eq("venue_id", venueId)
      .maybeSingle();
    if (loadErr || !row) {
      console.error("field-maps quick not-found: load failed", { venueId, loadErr });
      return redirectWithNotice(redirectTo, "Queue row not found.");
    }

    const now = new Date().toISOString();
    const priorNotes = String((row as any).notes ?? "").trim();
    const nextNotes = [priorNotes, `[${now}] not found: no field map located (manual skip)`].filter(Boolean).join("\n");

    const { error: updErr } = await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .update({
        status: "skipped",
        reviewed_by: admin.id,
        last_reviewed_at: now,
        notes: nextNotes,
      })
      .eq("venue_id", venueId);
    if (updErr) {
      console.error("field-maps quick not-found: update failed", { venueId, updErr });
      return redirectWithNotice(redirectTo, "Mark not found failed.");
    }

    revalidatePath(basePath);
    return redirectWithNotice(redirectTo, "Marked not found (skipped).");
  }

  async function seedQueueAction(formData: FormData) {
    "use server";
    const adminBase = String(formData.get("redirect_to") || basePath);
    // Intentionally redirect back to the default (pending) view after seeding so the user sees results.
    // Avoid capturing non-serializable helpers (e.g. buildHref) inside server actions.
    const successRedirectBase = `${basePath}?offset=0`;
    const seedLimit = clampInt(String(formData.get("seed_limit") ?? ""), 200, 1, 2000);

    // Fail fast with an actionable message when the migration hasn't been applied yet.
    const { error: probeErr } = await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .select("venue_id", { count: "exact", head: true } as any);
    if (probeErr) {
      console.error("field-maps seed: queue table probe failed", probeErr);
      return redirectWithNotice(adminBase, schemaHelp.body);
    }

    // Best-effort probe for multi-map storage. If missing, seeding still works but maps can't be applied to the table.
    const { error: mapsProbeErr } = await supabaseAdmin
      .from("venue_field_maps" as any)
      .select("id", { count: "exact", head: true } as any);
    if (mapsProbeErr) {
      console.warn("field-maps seed: venue_field_maps probe failed (ok pre-migration)", mapsProbeErr);
    }

    // Tier 1: only venues linked to tournaments and missing field maps / venue url or missing quality.
    // Keep it throttled, but also keep scanning until we find `seedLimit` *new* rows (not already queued).
    const pageSize = 500;
    const insertRows: any[] = [];
    let alreadyQueued = 0; // excludes skipped (we treat skipped as "dispositioned", but still "in queue" for conflict purposes)
    let alreadySkipped = 0;
    let scannedLinks = 0;
    const seenVenueIds = new Set<string>();

    for (let page = 0; page < 50 && insertRows.length < seedLimit; page += 1) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data: linkRows, error: linkErr } = await supabaseAdmin
        .from("tournament_venues" as any)
        .select("venue_id, created_at")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (linkErr) {
        console.error("field-maps seed: failed to load tournament_venues", linkErr);
        return redirectWithNotice(adminBase, "Seed failed: could not load tournament_venues.");
      }

      const pageVenueIds = Array.from(
        new Set((linkRows ?? []).map((r: any) => String(r.venue_id)).filter(Boolean))
      ).filter((id) => !seenVenueIds.has(id));

      scannedLinks += (linkRows ?? []).length;
      for (const id of pageVenueIds) seenVenueIds.add(id);

      if (!pageVenueIds.length) {
        if ((linkRows ?? []).length < pageSize) break;
        continue;
      }

      const { data: venues, error: venuesErr } = await supabaseAdmin
        .from("venues" as any)
        .select("id, name, venue_url, field_map_url, venue_url_quality")
        .in("id", pageVenueIds);

      if (venuesErr) {
        console.error("field-maps seed: failed to load venues", venuesErr);
        if ((venuesErr as any)?.code === "42703" || String((venuesErr as any)?.message || "").includes("field_map_url")) {
          return redirectWithNotice(adminBase, schemaHelp.body);
        }
        return redirectWithNotice(adminBase, "Seed failed: could not load venues.");
      }

      const candidates = (venues ?? [])
        .filter((v: any) => !isLikelySchoolVenueName((v as any).name))
        .filter((v: any) => !v.field_map_url || !v.venue_url || !v.venue_url_quality)
        .map((v: any) => String(v.id))
        .filter(Boolean);

      if (!candidates.length) {
        if ((linkRows ?? []).length < pageSize) break;
        continue;
      }

      const { data: existingQueueRaw, error: existingQueueErr } = await supabaseAdmin
        .from("venue_url_review_queue" as any)
        .select("venue_id,status")
        .in("venue_id", candidates);

      if (existingQueueErr) {
        console.error("field-maps seed: existing queue lookup failed", existingQueueErr);
        return redirectWithNotice(adminBase, "Seed failed: could not check existing queue rows.");
      }

      const existingRows = (existingQueueRaw ?? []) as any[];
      const existingIds = new Set(existingRows.map((r) => String(r.venue_id)).filter(Boolean));
      const skippedCount = existingRows.filter((r) => String(r.status ?? "") === "skipped").length;
      alreadySkipped += skippedCount;
      alreadyQueued += Math.max(0, existingIds.size - skippedCount);

      const newIds = candidates.filter((id) => !existingIds.has(id));
      if (!newIds.length) {
        if ((linkRows ?? []).length < pageSize) break;
        continue;
      }

      const venueById = new Map<string, any>();
      for (const v of (venues ?? []) as any[]) venueById.set(String(v.id), v);

      for (const id of newIds) {
        if (insertRows.length >= seedLimit) break;
        const v = venueById.get(id);
        insertRows.push({
          venue_id: id,
          status: "pending",
          current_venue_url: v?.venue_url ?? null,
          current_field_map_url: v?.field_map_url ?? null,
        });
      }

      if ((linkRows ?? []).length < pageSize) break;
    }

    if (!insertRows.length) {
      return redirectWithNotice(
        successRedirectBase,
        alreadyQueued || alreadySkipped
          ? `Nothing new to seed (all candidates already in the queue). already_queued=${alreadyQueued}${alreadySkipped ? `, skipped=${alreadySkipped}` : ""}.`
          : "Nothing new to seed."
      );
    }

    const { error: insErr } = await supabaseAdmin.from("venue_url_review_queue" as any).insert(insertRows);

    if (insErr) {
      console.error("field-maps seed: insert failed", insErr);
      if ((insErr as any)?.code === "PGRST205") {
        return redirectWithNotice(adminBase, schemaHelp.body);
      }
      return redirectWithNotice(adminBase, "Seed failed: insert error.");
    }

    revalidatePath(basePath);
    return redirectWithNotice(
      successRedirectBase,
      `Seeded ${insertRows.length} new venue(s) into the review queue.${alreadyQueued || alreadySkipped ? ` (already_queued=${alreadyQueued}${alreadySkipped ? `, skipped=${alreadySkipped}` : ""})` : ""}`
    );
  }

  async function autoSkipSchoolVenuesAction(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const adminBase = String(formData.get("redirect_to") || basePath);
    const skipLimit = clampInt(String(formData.get("skip_limit") ?? ""), 1500, 1, 5000);
    const now = new Date().toISOString();

    const { data: venuesRaw, error: venuesErr } = await supabaseAdmin
      .from("venues" as any)
      .select("id,name,venue_url,field_map_url")
      .or("name.ilike.%middle school%,name.ilike.%elementary%")
      .limit(skipLimit);

    if (venuesErr) {
      console.error("field-maps auto-skip schools: venues query failed", venuesErr);
      return redirectWithNotice(adminBase, "Auto-skip failed: could not load venues.");
    }

    const candidates = (venuesRaw ?? []).filter((v: any) => isLikelySchoolVenueName((v as any).name));
    if (!candidates.length) return redirectWithNotice(adminBase, "No middle school / elementary venues found (within limit).");

    const candidateIds = candidates.map((v: any) => String((v as any).id));

    const hasMap = new Set<string>();
    // Supabase/PostgREST can return "Bad Request" when `.in(...)` gets too large (URL too long).
    // Chunk to keep the request size bounded.
    for (let i = 0; i < candidateIds.length; i += 200) {
      const chunk = candidateIds.slice(i, i + 200);
      const { data: existingMapsRaw, error: existingMapsErr } = await supabaseAdmin
        .from("venue_field_maps" as any)
        .select("venue_id")
        .in("venue_id", chunk)
        .limit(50_000);
      if (existingMapsErr) {
        console.error("field-maps auto-skip schools: map lookup failed", existingMapsErr);
        return redirectWithNotice(adminBase, "Auto-skip failed: could not verify existing maps.");
      }
      for (const r of (existingMapsRaw ?? []) as any[]) hasMap.add(String((r as any).venue_id));
    }
    const eligible = candidates.filter((v: any) => !(v as any).field_map_url && !hasMap.has(String((v as any).id)));
    if (!eligible.length) return redirectWithNotice(adminBase, "Nothing to skip: all matching venues already have maps.");

    const eligibleIds = eligible.map((v: any) => String((v as any).id));
    const { data: queueRowsRaw, error: queueRowsErr } = await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .select("venue_id,status,suggested_field_map_url,notes")
      .in("venue_id", eligibleIds);
    if (queueRowsErr) {
      console.error("field-maps auto-skip schools: queue lookup failed", queueRowsErr);
      return redirectWithNotice(adminBase, "Auto-skip failed: could not load queue rows.");
    }

    const queueById = new Map<string, any>();
    for (const r of (queueRowsRaw ?? []) as any[]) queueById.set(String((r as any).venue_id), r);

    const insertRows: any[] = [];
    const updateIds: string[] = [];
    let protectedCount = 0;

    for (const v of eligible) {
      const id = String((v as any).id);
      const existing = queueById.get(id) ?? null;
      if (!existing) {
        insertRows.push({
          venue_id: id,
          status: "skipped",
          current_venue_url: (v as any).venue_url ?? null,
          current_field_map_url: (v as any).field_map_url ?? null,
          notes: `[${now}] auto-skip: venue name contains middle school/elementary (policy)`,
          reviewed_by: admin.id,
          last_reviewed_at: now,
        });
        continue;
      }
      const status = String((existing as any).status ?? "");
      const hasSuggestion = Boolean(String((existing as any).suggested_field_map_url ?? "").trim());
      if (status === "applied" || status === "approved" || hasSuggestion) {
        protectedCount += 1;
        continue;
      }
      updateIds.push(id);
    }

    let inserted = 0;
    if (insertRows.length) {
      const { error: insErr } = await supabaseAdmin
        .from("venue_url_review_queue" as any)
        .upsert(insertRows, { onConflict: "venue_id", ignoreDuplicates: true } as any);
      if (insErr) {
        console.error("field-maps auto-skip schools: insert failed", insErr);
        return redirectWithNotice(adminBase, "Auto-skip failed: insert error.");
      }
      inserted = insertRows.length;
    }

    let updated = 0;
    if (updateIds.length) {
      for (const id of updateIds) {
        const existing = queueById.get(id);
        const priorNotes = String((existing as any)?.notes ?? "").trim();
        const nextNotes = [priorNotes, `[${now}] auto-skip: venue name contains middle school/elementary (policy)`].filter(Boolean).join("\n");
        const { error: updErr } = await supabaseAdmin
          .from("venue_url_review_queue" as any)
          .update({ status: "skipped", notes: nextNotes, reviewed_by: admin.id, last_reviewed_at: now })
          .eq("venue_id", id);
        if (updErr) {
          console.error("field-maps auto-skip schools: update failed", { id, updErr });
          continue;
        }
        updated += 1;
      }
    }

    revalidatePath(basePath);
    return redirectWithNotice(adminBase, `Auto-skip schools complete. inserted=${inserted}, updated=${updated}, protected=${protectedCount}.`);
  }

  async function autoSkipIndoorSingleUseVenuesAction(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const adminBase = String(formData.get("redirect_to") || basePath);
    const skipLimit = clampInt(String(formData.get("skip_indoor_limit") ?? ""), 2000, 1, 10_000);
    const nowIso = new Date().toISOString();

    // Candidates: anything explicitly indoor, or likely single-use indoor sports (basketball/volleyball/hockey),
    // or venue name contains those tokens. We only mark rows as skipped in the queue (no deletes).
    const { data: venuesRaw, error: venuesErr } = await supabaseAdmin
      .from("venues" as any)
      .select("id,name,indoor,sport,field_map_url")
      .or(
        "indoor.eq.true,name.ilike.%indoor%,sport.eq.basketball,sport.eq.volleyball,sport.eq.hockey,name.ilike.%basketball%,name.ilike.%volleyball%,name.ilike.%hockey%"
      )
      .limit(skipLimit);

    if (venuesErr) {
      console.error("field-maps auto-skip indoor/single-use: venues query failed", venuesErr);
      return redirectWithNotice(adminBase, "Auto-skip failed: could not load venues.");
    }

    const candidateIds = (venuesRaw ?? []).map((v: any) => String(v.id)).filter(Boolean);
    if (!candidateIds.length) return redirectWithNotice(adminBase, "No indoor/basketball/volleyball/hockey venues found (within limit).");

    // Protect venues that already have maps (either cached or in venue_field_maps).
    const hasCached = new Set((venuesRaw ?? []).filter((v: any) => String(v.field_map_url ?? "").trim()).map((v: any) => String(v.id)));
    const hasMap = new Set<string>();
    // Chunk to avoid PostgREST "Bad Request" when `.in(...)` gets too large (URL too long).
    for (let i = 0; i < candidateIds.length; i += 200) {
      const chunk = candidateIds.slice(i, i + 200);
      const { data: existingMapsRaw, error: existingMapsErr } = await supabaseAdmin
        .from("venue_field_maps" as any)
        .select("venue_id")
        .in("venue_id", chunk)
        .limit(50_000);
      if (existingMapsErr) {
        console.error("field-maps auto-skip indoor/single-use: map lookup failed", existingMapsErr);
        return redirectWithNotice(adminBase, "Auto-skip failed: could not verify existing maps.");
      }
      for (const r of (existingMapsRaw ?? []) as any[]) hasMap.add(String((r as any).venue_id));
    }

    const eligibleIds = candidateIds.filter((id) => !hasCached.has(id) && !hasMap.has(id));
    const protectedCount = candidateIds.length - eligibleIds.length;
    if (!eligibleIds.length) return redirectWithNotice(adminBase, "Nothing to skip: all matching venues already have maps.");

    const { data: queueRowsRaw, error: queueRowsErr } = await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .select("venue_id,status,notes")
      .in("venue_id", eligibleIds)
      .limit(50_000);
    if (queueRowsErr) {
      console.error("field-maps auto-skip indoor/single-use: queue lookup failed", queueRowsErr);
      return redirectWithNotice(adminBase, "Auto-skip failed: could not load queue rows.");
    }

    const existingById = new Map<string, any>();
    for (const r of (queueRowsRaw ?? []) as any[]) existingById.set(String((r as any).venue_id), r);

    let updated = 0;
    let inserted = 0;

    // Update existing queue rows to skipped.
    const updateIds = Array.from(existingById.keys()).filter((id) => {
      const status = String(existingById.get(id)?.status ?? "");
      return status !== "applied";
    });

    if (updateIds.length) {
      // Append a generic note; detailed reason is usually obvious from venue name.
      // Keep it lightweight; this is just to move them out of the field-map discovery queue.
      for (const id of updateIds) {
        const prior = String(existingById.get(id)?.notes ?? "").trim();
        const nextNotes = [prior, `[auto-skip] indoor/single-use (basketball/volleyball/hockey)`].filter(Boolean).join("\n");
        const { error } = await supabaseAdmin
          .from("venue_url_review_queue" as any)
          .update({
            status: "skipped",
            notes: nextNotes,
            reviewed_by: admin.id,
            last_reviewed_at: nowIso,
          })
          .eq("venue_id", id);
        if (!error) updated += 1;
      }
    }

    // For venues not yet in the queue, insert skipped rows so they don't keep re-entering via seeding.
    const missingQueueIds = eligibleIds.filter((id) => !existingById.has(id));
    if (missingQueueIds.length) {
      const insertRows = missingQueueIds.map((id) => ({
        venue_id: id,
        status: "skipped",
        notes: `[auto-skip] indoor/single-use (basketball/volleyball/hockey)`,
        reviewed_by: admin.id,
        last_reviewed_at: nowIso,
      }));
      const { error } = await supabaseAdmin.from("venue_url_review_queue" as any).insert(insertRows);
      if (error) {
        console.error("field-maps auto-skip indoor/single-use: insert failed", error);
      } else {
        inserted = insertRows.length;
      }
    }

    revalidatePath(basePath);
    return redirectWithNotice(adminBase, `Auto-skip indoor/single-use complete. inserted=${inserted}, updated=${updated}, protected=${protectedCount}.`);
  }

  async function bulkQueueAction(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const adminBase = String(formData.get("redirect_to") || basePath);
    const action = String(formData.get("bulk_action") || "");
    const ids = (formData.getAll("selected") as string[]).map((v) => v.trim()).filter(Boolean);
    if (!ids.length) return redirectWithNotice(adminBase, "Select at least one venue.");
    const chosenEngine = (String(formData.get("engine") || "brave") as SearchEngine) || "brave";
    const chosenDiscoverMode = (String(formData.get("discover_mode") || "broad") as DiscoverMode) || "broad";

    if (action === "generate_draft_pngs" || action === "regenerate_draft_pngs") {
      const forceRegenerate = action === "regenerate_draft_pngs";
      const { error: probeErr } = await supabaseAdmin
        .from("venue_url_review_queue" as any)
        .select("venue_id,generated_map_url", { head: true, count: "exact" } as any);
      if (probeErr) {
        console.error("field-maps generate: schema probe failed", probeErr);
        return redirectWithNotice(adminBase, schemaHelp.body);
      }

      const bucket = (process.env.SUPABASE_VENUE_MAPS_BUCKET ?? "venue-maps").trim();
      const generator = "mapbox_static_v1";
      const version = new Date().toISOString().slice(0, 10);
      const minPngBytes = 120_000; // heuristic: avoid storing near-blank renders (often bad coordinates/ocean tiles)
      const sunPathEnabled = String(process.env.ENABLE_SUN_PATH_OVERLAY ?? "").trim().toLowerCase() === "true";

      const { data: venueRowsRaw, error: venueRowsErr } = await supabaseAdmin
        .from("venues" as any)
        .select("id,name,address,city,state,zip,latitude,longitude,field_map_url")
        .in("id", ids);

      if (venueRowsErr) {
        console.error("field-maps generate: failed to load venues", venueRowsErr);
        return redirectWithNotice(adminBase, "Generate failed: could not load venues.");
      }

      const venueById = new Map<string, any>();
      for (const v of (venueRowsRaw ?? []) as any[]) venueById.set(String(v.id), v);

      let updated = 0;
      let skipped = 0;
      let missingCoords = 0;
      let errored = 0;
      let alreadyApplied = 0;
      const skipReasons: Record<string, number> = {};
      const errorReasons: Record<string, number> = {};

      const bump = (m: Record<string, number>, k: string) => {
        m[k] = (m[k] ?? 0) + 1;
      };

      const errorKey = (raw: string) => {
        const msg = String(raw || "").trim() || "unknown";
        if (msg.startsWith("bad_coords:")) return msg.split(" ")[0];
        if (msg.startsWith("suspect_png_size:")) return "suspect_png_size";
        if (msg.startsWith("mapbox_static_http_")) return msg;
        if (msg.startsWith("storage_upload_failed:")) return "storage_upload_failed";
        if (msg.startsWith("missing_mapbox_access_token")) return "missing_mapbox_access_token";
        return msg.length > 60 ? msg.slice(0, 60) : msg;
      };

      const { error: bypassProbeErr } = await supabaseAdmin
        .from("venue_url_review_queue" as any)
        .select("bypass_coord_validation", { head: true, count: "exact" } as any);
      const supportsCoordBypass = !bypassProbeErr;

      for (const venueId of ids) {
        const v = venueById.get(venueId);
        if (!v) {
          errored += 1;
          continue;
        }

        const { data: queueRaw, error: queueErr } = await supabaseAdmin
          .from("venue_url_review_queue" as any)
          .select(
            "venue_id,status,notes,generated_map_url,generation_attempt_count,generation_error,approve_generated_map,generated_map_applied_id" +
              (supportsCoordBypass ? ",bypass_coord_validation" : "")
          )
          .eq("venue_id", venueId)
          .maybeSingle();

        if (queueErr || !queueRaw) {
          console.error("field-maps generate: queue load failed", { venueId, queueErr });
          errored += 1;
          continue;
        }

        const alreadyHasGenerated = Boolean(String((queueRaw as any).generated_map_url ?? "").trim());
        if (alreadyHasGenerated && !forceRegenerate) {
          skipped += 1;
          bump(skipReasons, "has_generated");
          continue;
        }

        // If the venue already has a cached map URL, skip generation (generated maps are for missing-map venues).
        if (String((v as any).field_map_url ?? "").trim()) {
          skipped += 1;
          bump(skipReasons, "has_cached_map");
          continue;
        }

        // If the queue already applied a generated map into venue_field_maps, don't overwrite the queue pointer.
        // (The canonical record exists in venue_field_maps; queue stores only one generated draft at a time.)
        if (forceRegenerate && (queueRaw as any).generated_map_applied_id != null) {
          alreadyApplied += 1;
          bump(skipReasons, "already_applied");
          continue;
        }

        const lat = Number((v as any).latitude);
        const lng = Number((v as any).longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          missingCoords += 1;
          bump(skipReasons, "missing_coords");
          const priorNotes = String((queueRaw as any).notes ?? "").trim();
          const attempt = Number((queueRaw as any).generation_attempt_count ?? 0) || 0;
          const nextNotes = [priorNotes, `[generated:${generator}] skipped (missing_coords)`].filter(Boolean).join("\n");
          await supabaseAdmin
            .from("venue_url_review_queue" as any)
            .update({
              generation_attempt_count: attempt + 1,
              generation_error: "missing_coords",
              status: "manual_review",
              notes: nextNotes,
            })
            .eq("venue_id", venueId);
          continue;
        }

        try {
          const bypassCoordValidation = Boolean((queueRaw as any).bypass_coord_validation ?? false);
          const coordCheck = await validateVenueCoordinates({
            venueId,
            lat,
            lng,
            venueAddress: (v as any).address ?? null,
            venueCity: (v as any).city ?? null,
            venueState: (v as any).state ?? null,
            venueZip: (v as any).zip ?? null,
          });
          if (coordCheck.severity === "hard" && !bypassCoordValidation) {
            const priorNotes = String((queueRaw as any).notes ?? "").trim();
            const attempt = Number((queueRaw as any).generation_attempt_count ?? 0) || 0;
            const msg = `bad_coords:${coordCheck.reason}${(coordCheck as any).details ? ` ${(coordCheck as any).details}` : ""}`;
            const nextNotes = [
              priorNotes,
              `[generated:${generator}] skipped (${msg}) center=${lat.toFixed(6)},${lng.toFixed(6)}`,
            ]
              .filter(Boolean)
              .join("\n");
            await supabaseAdmin
              .from("venue_url_review_queue" as any)
              .update({
                generation_attempt_count: attempt + 1,
                generation_error: msg,
                status: "manual_review",
                notes: nextNotes,
              })
              .eq("venue_id", venueId);
            errored += 1;
            continue;
          }

          const pitchCenter = await maybeRecenterOnOsmPitches({ lat, lng, fallbackZoom: 16 });

          // Optional POI hints (non-blocking): best-effort fetch/store before generating the image.
          const poiHints = await maybeFetchAndStorePoiHints({ venueId, lat, lng });

          const coordNote =
            coordCheck.severity === "soft"
              ? `[coord_validation] warning (${coordCheck.reason}${(coordCheck as any).details ? ` ${(coordCheck as any).details}` : ""})`
              : coordCheck.severity !== "ok" && bypassCoordValidation
                ? `[coord_validation] bypassed (${coordCheck.reason}${(coordCheck as any).details ? ` ${(coordCheck as any).details}` : ""})`
                : null;

          const { bytes, dateStamp } = await renderGeneratedMapPng({
            venue_id: venueId,
            name: String((v as any).name ?? "").trim() || venueId,
            address: (v as any).address ?? null,
            city: (v as any).city ?? null,
            state: (v as any).state ?? null,
            zip: (v as any).zip ?? null,
            latitude: lat,
            longitude: lng,
          }, {
            zoom: pitchCenter.zoom,
            centerLatitude: pitchCenter.centerLat,
            centerLongitude: pitchCenter.centerLng,
            includeSunPathOverlay: sunPathEnabled,
          });

          if (bytes.length < minPngBytes) {
            const priorNotes = String((queueRaw as any).notes ?? "").trim();
            const attempt = Number((queueRaw as any).generation_attempt_count ?? 0) || 0;
            const msg = `suspect_png_size:${bytes.length}`;
            const nextNotes = [
              priorNotes,
              `[generated:${generator}] errored (${msg}) center=${lat.toFixed(6)},${lng.toFixed(6)}; verify venue coordinates`,
            ]
              .filter(Boolean)
              .join("\n");
            await supabaseAdmin
              .from("venue_url_review_queue" as any)
              .update({
                generation_attempt_count: attempt + 1,
                generation_error: msg,
                status: "manual_review",
                notes: nextNotes,
              })
              .eq("venue_id", venueId);
            errored += 1;
            continue;
          }

          const contentHash = sha256Hex(bytes);
          const uploaded = await uploadGeneratedMapToStorage({
            bytes,
            venueId,
            hashHex: contentHash,
            dateStamp,
            bucket,
          });

          const priorNotes = String((queueRaw as any).notes ?? "").trim();
          const attempt = Number((queueRaw as any).generation_attempt_count ?? 0) || 0;
          const notePrefix = forceRegenerate ? `[generated:${generator}] regenerated` : `[generated:${generator}] created`;
          const nextNotes = [
            priorNotes,
            `${notePrefix} ${uploaded.publicUrl} center=${pitchCenter.centerLat.toFixed(6)},${pitchCenter.centerLng.toFixed(6)}${pitchCenter.used ? ` pitches=${pitchCenter.pitchCount}` : ""}`,
            coordNote,
            poiHints.summary,
            sunPathEnabled ? `[sun_path] enabled` : null,
          ]
            .filter(Boolean)
            .join("\n");

          const nextStatus = forceRegenerate ? "suggested" : (queueRaw as any).status === "pending" ? "suggested" : (queueRaw as any).status;

          const { error: updErr } = await supabaseAdmin
            .from("venue_url_review_queue" as any)
            .update({
              generated_map_object_path: uploaded.objectPath,
              generated_map_url: uploaded.publicUrl,
              generated_map_hash: contentHash,
              generated_map_version: version,
              generated_map_source: "generated_mapbox",
              generated_at: new Date().toISOString(),
              generation_attempt_count: attempt + 1,
              generation_error: null,
              approve_generated_map: forceRegenerate ? false : (queueRaw as any).approve_generated_map ?? false,
              generated_map_applied_id: forceRegenerate ? null : (queueRaw as any).generated_map_applied_id ?? null,
              status: nextStatus,
              notes: nextNotes,
            })
            .eq("venue_id", venueId);

          if (updErr) {
            console.error("field-maps generate: queue update failed", { venueId, updErr });
            errored += 1;
          } else {
            updated += 1;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "generation_failed";
          bump(errorReasons, errorKey(msg));
          console.error("field-maps generate: failed", { venueId, msg });
          errored += 1;
          const priorNotes = String((queueRaw as any).notes ?? "").trim();
          const attempt = Number((queueRaw as any).generation_attempt_count ?? 0) || 0;
          const nextNotes = [priorNotes, `[generated:${generator}] errored (${msg})`].filter(Boolean).join("\n");
          await supabaseAdmin
            .from("venue_url_review_queue" as any)
            .update({
              generation_attempt_count: attempt + 1,
              generation_error: msg,
              notes: nextNotes,
            })
            .eq("venue_id", venueId);
        }

        await sleep(1100);
      }

      revalidatePath(basePath);
      const formatTop = (m: Record<string, number>) =>
        Object.entries(m)
          .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
          .slice(0, 3)
          .map(([k, v]) => `${k}=${v}`)
          .join(" • ");
      const skipDetail = formatTop(skipReasons);
      const errDetail = formatTop(errorReasons);
      return redirectWithNotice(
        adminBase,
        `${forceRegenerate ? "Regenerate" : "Generate"} complete. updated=${updated}, skipped=${skipped}, missing_coords=${missingCoords}, already_applied=${alreadyApplied}, errored=${errored}${
          skipDetail ? `, skip_reasons: ${skipDetail}` : ""
        }${errDetail ? `, errors: ${errDetail}` : ""}.`
      );
    }

    if (action === "approve_generated") {
      const { error: probeErr } = await supabaseAdmin
        .from("venue_url_review_queue" as any)
        .select("venue_id,approve_generated_map", { head: true, count: "exact" } as any);
      if (probeErr) {
        console.error("field-maps approve generated: schema probe failed", probeErr);
        return redirectWithNotice(adminBase, schemaHelp.body);
      }

      const { data: rowsRaw, error: rowsErr } = await supabaseAdmin
        .from("venue_url_review_queue" as any)
        .select("venue_id,generated_map_url")
        .in("venue_id", ids);
      if (rowsErr) {
        console.error("field-maps bulk approve generated failed (load rows)", rowsErr);
        return redirectWithNotice(adminBase, "Bulk approve generated failed.");
      }

      const rows = (rowsRaw ?? []) as any[];
      const eligibleIds = rows
        .filter((r) => Boolean(String(r.generated_map_url ?? "").trim()))
        .map((r) => String(r.venue_id));

      const skipped = ids.length - eligibleIds.length;
      if (!eligibleIds.length) {
        return redirectWithNotice(adminBase, "Nothing to approve: selected rows have no generated map URL yet.");
      }

      const { error } = await supabaseAdmin
        .from("venue_url_review_queue" as any)
        .update({
          approve_generated_map: true,
          status: "approved",
          reviewed_by: admin.id,
          last_reviewed_at: new Date().toISOString(),
        })
        .in("venue_id", eligibleIds);
      if (error) {
        console.error("field-maps bulk approve generated failed", error);
        return redirectWithNotice(adminBase, "Bulk approve generated failed.");
      }
      revalidatePath(basePath);
      return redirectWithNotice(
        adminBase,
        skipped ? `Approved ${eligibleIds.length} generated map(s). Skipped ${skipped} with no generated map URL.` : `Approved ${eligibleIds.length} generated map(s).`
      );
    }

    if (action === "approve_maps") {
      const { data: rowsRaw, error: rowsErr } = await supabaseAdmin
        .from("venue_url_review_queue" as any)
        .select("venue_id,suggested_field_map_url")
        .in("venue_id", ids);
      if (rowsErr) {
        console.error("field-maps bulk approve failed (load rows)", rowsErr);
        return redirectWithNotice(adminBase, "Bulk approve failed.");
      }

      const rows = (rowsRaw ?? []) as any[];
      const eligibleIds = rows
        .filter((r) => Boolean(String(r.suggested_field_map_url ?? "").trim()))
        .map((r) => String(r.venue_id));

      const skipped = ids.length - eligibleIds.length;
      if (!eligibleIds.length) {
        return redirectWithNotice(adminBase, "Nothing to approve: selected rows have no suggested map URL yet.");
      }

      const { error } = await supabaseAdmin
        .from("venue_url_review_queue" as any)
        .update({
          approve_field_map_url: true,
          status: "approved",
          reviewed_by: admin.id,
          last_reviewed_at: new Date().toISOString(),
        })
        .in("venue_id", eligibleIds);
      if (error) {
        console.error("field-maps bulk approve failed", error);
        return redirectWithNotice(adminBase, "Bulk approve failed.");
      }
      revalidatePath(basePath);
      return redirectWithNotice(
        adminBase,
        skipped ? `Approved ${eligibleIds.length} venue(s). Skipped ${skipped} with no suggested map URL.` : `Approved ${eligibleIds.length} venue(s).`
      );
    }

    if (action === "discover_maps") {
      const { error: mapsProbeErr } = await supabaseAdmin
        .from("venue_field_maps" as any)
        .select("id", { count: "exact", head: true } as any);
      if (mapsProbeErr) {
        console.error("field-maps discover: venue_field_maps probe failed", mapsProbeErr);
        return redirectWithNotice(adminBase, schemaHelp.body);
      }

      const { data: venueRowsRaw, error: venueRowsErr } = await supabaseAdmin
        .from("venues" as any)
        .select("id,name,address,city,state,zip,venue_url,latitude,longitude")
        .in("id", ids);

      if (venueRowsErr) {
        console.error("field-maps discover: failed to load venues", venueRowsErr);
        return redirectWithNotice(adminBase, "Discover failed: could not load venues.");
      }

      const venueById = new Map<string, any>();
      for (const v of (venueRowsRaw ?? []) as any[]) venueById.set(String(v.id), v);

      let updated = 0;
      let skipped = 0;
      let noMatch = 0;
      let errored = 0;

      for (const venueId of ids) {
        const v = venueById.get(venueId);
        if (!v) {
          errored += 1;
          continue;
        }

        const { data: queueRaw, error: queueErr } = await supabaseAdmin
          .from("venue_url_review_queue" as any)
          .select("venue_id,suggested_field_map_url,notes,status")
          .eq("venue_id", venueId)
          .maybeSingle();

        if (queueErr || !queueRaw) {
          console.error("field-maps discover: queue load failed", { venueId, queueErr });
          errored += 1;
          continue;
        }

        if (String((queueRaw as any).suggested_field_map_url ?? "").trim()) {
          skipped += 1;
          continue;
        }

        const name = String(v.name ?? "").trim();
        const city = String(v.city ?? "").trim();
        const st = String(v.state ?? "").trim();
        const zip = String(v.zip ?? "").trim();
        const venueUrl = String(v.venue_url ?? "").trim();
        const venueHost = venueUrl ? safeUrlHost(venueUrl) : null;

        const baseTerms = [name, city, st].filter(Boolean).join(" ").trim() || name;
        const nameLite = name.replace(/\b(fields?|complex|sports complex|sport complex|park)\b/gi, "").replace(/\s+/g, " ").trim();
        const baseTermsLite = [nameLite, city, st].filter(Boolean).join(" ").trim();
        const addressRaw = String(v.address ?? "").trim();
        const address = addressRaw ? addressRaw.replace(/\s+/g, " ") : "";
        const baseTermsWithAddress =
          address && city && st ? `${name} ${address} ${city} ${st}`.replace(/\s+/g, " ").trim() : "";
        // Query set is ordered by expected "map artifact" precision first, then broader.
        // We intentionally avoid leading with "site map" (often triggers XML sitemap false positives).
        const queries = [
          venueHost ? `site:${venueHost} facility maps` : null,
          venueHost ? `site:${venueHost} field map` : null,
          venueHost ? `site:${venueHost} complex map` : null,
          venueHost ? `site:${venueHost} park map` : null,
          venueHost ? `site:${venueHost} map pdf` : null,
          venueHost ? `site:${venueHost} location and map` : null,
          `${baseTerms} field-map`,
          `${baseTerms} facility maps`,
          `${baseTerms} field map`,
          `${baseTerms} complex map`,
          `${baseTerms} campus map`,
          `${baseTerms} court map`,
          `${baseTerms} park map`,
          `${baseTerms} map pdf`,
          `${baseTerms} facility map pdf`,
          `${baseTerms} field map pdf`,
          `${baseTerms} park map pdf`,
          `${baseTerms} map jpg`,
          `${baseTerms} location and map`,
          `${baseTerms} directions and map`,
          // Fallbacks for sites that publish only PDFs but don't use "map" keywords consistently.
          `"${name}" pdf`,
          `"${name}" "field map"`,
          `"${name}" "facility map"`,
          `"${name}" "site map"`,
          baseTermsLite ? `${baseTermsLite} map pdf` : null,
          baseTermsLite ? `${baseTermsLite} park map pdf` : null,
          baseTermsWithAddress ? `${baseTermsWithAddress} map pdf` : null,
          baseTermsWithAddress ? `${baseTermsWithAddress} location and map` : null,
          zip ? `${name} ${zip} facility map` : null,
          zip ? `${name} ${zip} map pdf` : null,
          // Keep these late; they can be useful on some municipal sites, but are noisy.
          `${baseTerms} facility map`,
          `${baseTerms} site map`,
          venueHost ? `site:${venueHost} map` : null,
        ]
          .filter(Boolean)
          // de-dupe while preserving order
          .filter((q, idx, arr) => arr.indexOf(q) === idx)
          .map((q) => maybeAddFiletypePdf(q)) as string[];

        let best: { url: string; title?: string | null; snippet?: string | null; score: number } | null = null;
        let lastErr: string | null = null;
        let bestQuery: string | null = null;
        let pickedEngine: SearchEngine = chosenEngine;

        // Try more queries; stop early only if confidence is truly high.
        const queriesToTry = queries.slice(0, 26);
        for (const q of queriesToTry) {
          let searchRes =
            chosenEngine === "google"
              ? await googleCseSearch({ q, count: 10 })
              : await braveSearch({ q, count: 10 });

          // If we're rate limited, pause and retry once (otherwise we'd incorrectly mark "no match").
          if (searchRes.error === "brave_http_429") {
            lastErr = searchRes.error;
            await sleep(12_000);
            searchRes = await braveSearch({ q, count: 10 });
          }

          if (searchRes.error) {
            lastErr = searchRes.error;
            // If we're still rate-limited, bail early to avoid hammering and to keep the row pending.
            if (searchRes.error === "brave_http_429") break;
            continue;
          }
          for (const r of searchRes.results) {
            if (chosenDiscoverMode === "strict" && !isStrictEligible(r)) continue;
            const scored = scoreMapCandidate(r, { preferredHost: venueHost });
            if (scored.score <= 0) continue;
            if (!best || scored.score > best.score) {
              best = { url: r.url, title: r.title, snippet: r.snippet, score: scored.score };
              bestQuery = q;
            }
          }
          if (best && best.score >= 70) break; // stop early on very high-confidence hit
          await sleep(1100); // throttle: ~<= 1 req/sec globally per action execution
        }

        if (!best) {
          // Host discovery fallback: if we don't know the venue host, try one broad query to pick a likely official domain,
          // then re-run a few high-signal site: queries on that domain.
          if (!venueHost) {
            const hostQuery = baseTermsWithAddress || baseTerms;
            let hostSearchRes =
              chosenEngine === "google"
                ? await googleCseSearch({ q: hostQuery, count: 5 })
                : await braveSearch({ q: hostQuery, count: 5 });
            if (!hostSearchRes.error) {
              const candidateHost = pickHostCandidateFromResults(hostSearchRes.results);
              if (candidateHost) {
                const siteQueries = [
                  `site:${candidateHost} field map`,
                  `site:${candidateHost} field-map`,
                  `site:${candidateHost} facility map`,
                  `site:${candidateHost} location and map`,
                  `site:${candidateHost} map pdf`,
                ];
                for (const q of siteQueries) {
                  const searchRes =
                    chosenEngine === "google"
                      ? await googleCseSearch({ q, count: 10 })
                      : await braveSearch({ q, count: 10 });
                  if (searchRes.error) continue;
                  for (const r of searchRes.results) {
                    if (chosenDiscoverMode === "strict" && !isStrictEligible(r)) continue;
                    const scored = scoreMapCandidate(r, { preferredHost: candidateHost });
                    if (scored.score <= 0) continue;
                    if (!best || scored.score > best.score) {
                      best = { url: r.url, title: r.title, snippet: r.snippet, score: scored.score };
                      bestQuery = q;
                    }
                  }
                  if (best && best.score >= 70) break;
                  await sleep(700);
                }
              }
            }
          }

          // Engine fallback: Brave is cheaper but misses some PDFs (e.g. SportNGIN attachments).
          // If Brave finds no match and Google CSE is configured, try a small, high-signal subset on Google.
          if (!best && chosenEngine === "brave" && canUseGoogleCse()) {
            const googleFallbackQueries = [
              maybeAddFiletypePdf(`${baseTerms} field map pdf`),
              maybeAddFiletypePdf(`${(baseTermsWithAddress || baseTerms).trim()} map pdf`),
              maybeAddFiletypePdf(`"${name}" pdf`),
              maybeAddFiletypePdf(`${baseTerms} facility map pdf`),
              `${baseTerms} field-map`,
            ]
              .filter(Boolean)
              .filter((q, idx, arr) => arr.indexOf(q) === idx)
              .slice(0, 3);

            for (const q of googleFallbackQueries) {
              const searchRes = await googleCseSearch({ q, count: 10 });
              if (searchRes.error) {
                lastErr = searchRes.error;
                continue;
              }
              for (const r of searchRes.results) {
                if (chosenDiscoverMode === "strict" && !isStrictEligible(r)) continue;
                const scored = scoreMapCandidate(r, { preferredHost: venueHost });
                if (scored.score <= 0) continue;
                if (!best || scored.score > best.score) {
                  best = { url: r.url, title: r.title, snippet: r.snippet, score: scored.score };
                  bestQuery = q;
                  pickedEngine = "google";
                }
              }
              if (best && best.score >= 70) break;
              await sleep(700);
            }
          }

          if (best) {
            // fall through to normal update logic
          } else {
          const shownQueries = queriesToTry.slice(0, 5).join(" | ");
          const isRateLimited = lastErr === "brave_http_429";
          if (isRateLimited) errored += 1;
          else noMatch += 1;
          const nextNotes = [
            String((queueRaw as any).notes ?? "").trim(),
            `[discover:${chosenEngine}] ${isRateLimited ? "errored" : "no match"}${lastErr ? ` (${lastErr})` : ""} for "${baseTerms}"`,
            shownQueries ? `[discover:${chosenEngine}] queries: ${shownQueries}` : null,
            chosenEngine === "brave" && canUseGoogleCse() ? `[discover:google] fallback attempted` : null,
          ]
            .filter(Boolean)
            .join("\n");
          await supabaseAdmin.from("venue_url_review_queue" as any).update({ notes: nextNotes }).eq("venue_id", venueId);
          continue;
          }
        }

        const confidence = inferConfidence(best);
        const type = inferMapTypeFromUrl(best.url);
        const nextNotes = [
          String((queueRaw as any).notes ?? "").trim(),
          `[discover:${pickedEngine}] picked (${best.score}) ${best.url}${bestQuery ? ` (q: ${bestQuery})` : ""}`,
        ]
          .filter(Boolean)
          .join("\n");

        const { error: updErr } = await supabaseAdmin
          .from("venue_url_review_queue" as any)
          .update({
            suggested_field_map_url: best.url,
            suggested_field_map_source: `discover_${pickedEngine}`,
            suggested_field_map_confidence: confidence,
            suggested_field_map_type: type,
            status: (queueRaw as any).status === "pending" ? "suggested" : (queueRaw as any).status,
            notes: nextNotes,
          })
          .eq("venue_id", venueId);

        if (updErr) {
          console.error("field-maps discover: update failed", { venueId, updErr });
          errored += 1;
          continue;
        }

        updated += 1;
        await sleep(300); // small pacing between venues
      }

      revalidatePath(basePath);
      return redirectWithNotice(
        adminBase,
        `Discover complete (${chosenEngine}/${chosenDiscoverMode}). updated=${updated}, skipped=${skipped}, no_match=${noMatch}, errored=${errored}.`
      );
    }

    if (action === "delete_queue_rows") {
      const { error } = await supabaseAdmin.from("venue_url_review_queue" as any).delete().in("venue_id", ids);
      if (error) {
        console.error("field-maps bulk delete failed", error);
        return redirectWithNotice(adminBase, "Bulk delete failed.");
      }
      revalidatePath(basePath);
      return redirectWithNotice(adminBase, `Removed ${ids.length} row(s) from the queue (venues not deleted).`);
    }

    if (action === "mark_not_found") {
      const now = new Date().toISOString();
      const { data: rowsRaw, error: rowsErr } = await supabaseAdmin
        .from("venue_url_review_queue" as any)
        .select("venue_id,notes,status")
        .in("venue_id", ids);
      if (rowsErr) {
        console.error("field-maps bulk not-found failed (load rows)", rowsErr);
        return redirectWithNotice(adminBase, "Mark not found failed.");
      }

      let updated = 0;
      for (const row of (rowsRaw ?? []) as any[]) {
        const venueId = String(row.venue_id);
        const priorNotes = String(row.notes ?? "").trim();
        const nextNotes = [priorNotes, `[${now}] not found: no field map located (manual skip)`].filter(Boolean).join("\n");
        const { error } = await supabaseAdmin
          .from("venue_url_review_queue" as any)
          .update({
            status: "skipped",
            notes: nextNotes,
            last_reviewed_at: now,
          })
          .eq("venue_id", venueId);
        if (error) {
          console.error("field-maps bulk not-found update failed", { venueId, error });
          continue;
        }
        updated += 1;
      }

      revalidatePath(basePath);
      return redirectWithNotice(adminBase, `Marked ${updated} row(s) as skipped (venues not deleted).`);
    }

    if (action === "apply_selected") {
      const { error: mapsProbeErr } = await supabaseAdmin
        .from("venue_field_maps" as any)
        .select("id", { count: "exact", head: true } as any);
      if (mapsProbeErr) {
        console.error("field-maps apply: venue_field_maps probe failed", mapsProbeErr);
        return redirectWithNotice(adminBase, schemaHelp.body);
      }
      const { error: queueProbeErr } = await supabaseAdmin
        .from("venue_url_review_queue" as any)
        .select("venue_id,generated_map_url,approve_generated_map", { head: true, count: "exact" } as any);
      if (queueProbeErr) {
        console.error("field-maps apply: queue schema probe failed", queueProbeErr);
        return redirectWithNotice(adminBase, schemaHelp.body);
      }

      let applied = 0;
      let stale = 0;
      let skipped = 0;
      let errored = 0;

      for (const venueId of ids) {
        const { data: queueRaw, error: queueErr } = await supabaseAdmin
          .from("venue_url_review_queue" as any)
          .select(
            "venue_id,status,current_venue_url,current_field_map_url,suggested_venue_url,suggested_field_map_url,suggested_field_map_source,suggested_field_map_confidence,suggested_field_map_type,suggested_field_map_sport,suggested_field_map_set_primary,applied_field_map_id,generated_map_url,generated_map_hash,generated_map_version,generated_map_source,approve_generated_map,generated_map_applied_id,approve_venue_url,approve_field_map_url,override_good_venue_url,notes"
          )
          .eq("venue_id", venueId)
          .maybeSingle();

        const queue = (queueRaw as any) as any;

        if (queueErr || !queue) {
          console.error("field-maps apply: queue load failed", { venueId, queueErr });
          errored += 1;
          continue;
        }

        if (queue.status !== "approved") {
          skipped += 1;
          continue;
        }

        const { data: venueRaw, error: venueErr } = await supabaseAdmin
          .from("venues" as any)
          .select("id,venue_url,field_map_url,venue_url_quality")
          .eq("id", venueId)
          .maybeSingle();

        const venue = (venueRaw as any) as any;

        if (venueErr || !venue) {
          console.error("field-maps apply: venue load failed", { venueId, venueErr });
          errored += 1;
          continue;
        }

        const liveVenueUrl = (venue.venue_url ?? null) as string | null;
        const liveFieldMapUrl = (venue.field_map_url ?? null) as string | null;
        const snapshotVenueUrl = (queue.current_venue_url ?? null) as string | null;
        const snapshotFieldMapUrl = (queue.current_field_map_url ?? null) as string | null;

        if (liveVenueUrl !== snapshotVenueUrl || liveFieldMapUrl !== snapshotFieldMapUrl) {
          stale += 1;
          const nextNotes = [
            (queue.notes ?? "").trim(),
            `[${new Date().toISOString()}] Live venue record changed since snapshot; re-review required.`,
          ]
            .filter(Boolean)
            .join("\n");
          await supabaseAdmin
            .from("venue_url_review_queue" as any)
            .update({ status: "manual_review", notes: nextNotes })
            .eq("venue_id", venueId);
          continue;
        }

        const approveVenueUrl = Boolean(queue.approve_venue_url);
        const approveFieldMapUrl = Boolean(queue.approve_field_map_url);
        const overrideGoodVenueUrl = Boolean(queue.override_good_venue_url);

        const suggestedVenueUrl = (queue.suggested_venue_url ?? "").trim() || null;
        const suggestedFieldMapUrl = (queue.suggested_field_map_url ?? "").trim() || null;
        const suggestedFieldMapSport = (queue.suggested_field_map_sport ?? "").trim() || null;
        const suggestedSetPrimary = Boolean(queue.suggested_field_map_set_primary);

        const approveGeneratedMap = Boolean((queue as any).approve_generated_map);
        const generatedMapUrl = String((queue as any).generated_map_url ?? "").trim() || null;
        const generatedMapHash = String((queue as any).generated_map_hash ?? "").trim() || null;
        const generatedMapVersion = String((queue as any).generated_map_version ?? "").trim() || null;
        const generatedAlreadyApplied = (queue as any).generated_map_applied_id != null;

        const shouldApplyVenueUrl =
          approveVenueUrl &&
          Boolean(suggestedVenueUrl) &&
          (String(venue.venue_url_quality ?? "").toLowerCase() !== "good" || overrideGoodVenueUrl);
        const shouldApplyFieldMapUrl = approveFieldMapUrl && Boolean(suggestedFieldMapUrl);
        const shouldApplyGeneratedMap = approveGeneratedMap && Boolean(generatedMapUrl) && !generatedAlreadyApplied;

        if (!shouldApplyVenueUrl && !shouldApplyFieldMapUrl && !shouldApplyGeneratedMap) {
          skipped += 1;
          continue;
        }

        // Generated-only apply (no venue field_map_url cache updates in v1).
        if (shouldApplyGeneratedMap && !shouldApplyVenueUrl && !shouldApplyFieldMapUrl) {
          // Safety: if the venue already has a cached map URL, treat it as "official enough" and skip generated.
          if (String(liveFieldMapUrl ?? "").trim()) {
            skipped += 1;
            continue;
          }

          const nowIso = new Date().toISOString();
          const insertPayload: Record<string, any> = {
            venue_id: venueId,
            map_url: generatedMapUrl,
            map_hash: generatedMapHash || null,
            map_source: String((queue as any).generated_map_source ?? "generated_mapbox"),
            map_confidence: null,
            map_type: "general_facility_map",
            sport: null,
            notes: `Generated (approximate). generator=mapbox_static_v1 version=${generatedMapVersion || "unknown"}`,
            is_primary: false,
            // New columns (if migration applied)
            map_origin: "generated_mapbox",
            is_generated: true,
            generator: "mapbox_static_v1",
            generator_version: generatedMapVersion || null,
            generated_at: (queue as any).generated_at ?? nowIso,
            status: "active",
            archived_at: null,
          };

          let insertedId: number | null = null;
          const { data: inserted, error: insertErr } = await supabaseAdmin
            .from("venue_field_maps" as any)
            .insert(insertPayload)
            .select("id")
            .maybeSingle();

          if (insertErr || !inserted) {
            const minimal = {
              venue_id: venueId,
              map_url: generatedMapUrl,
              map_hash: generatedMapHash || null,
              map_source: "generated_mapbox",
              map_type: "general_facility_map",
              notes: `Generated (approximate). generator=mapbox_static_v1 version=${generatedMapVersion || "unknown"}`,
              is_primary: false,
            };
            const { data: inserted2, error: insertErr2 } = await supabaseAdmin
              .from("venue_field_maps" as any)
              .insert(minimal)
              .select("id")
              .maybeSingle();
            if (insertErr2 || !inserted2) {
              console.error("field-maps apply: generated insert failed", { venueId, insertErr, insertErr2 });
              errored += 1;
              continue;
            }
            insertedId = Number((inserted2 as any).id);
          } else {
            insertedId = Number((inserted as any).id);
          }

          const { error: mapsAuditErr } = await supabaseAdmin.from("venue_field_maps_audit_log" as any).insert({
            venue_id: venueId,
            event_type: "insert_generated",
            map_id: insertedId,
            map_url: generatedMapUrl,
            actor: admin.id,
            reason: "applied generated map from venue_url_review_queue",
          });
          if (mapsAuditErr) {
            console.error("field-maps apply: generated audit insert failed", { venueId, mapsAuditErr });
          }

          const { error: queueUpdateErr } = await supabaseAdmin
            .from("venue_url_review_queue" as any)
            .update({
              status: "applied",
              generated_map_applied_id: insertedId,
              reviewed_by: admin.id,
              last_reviewed_at: nowIso,
            })
            .eq("venue_id", venueId);
          if (queueUpdateErr) {
            console.error("field-maps apply: generated queue update failed", { venueId, queueUpdateErr });
          }

          applied += 1;
          continue;
        }

        const nextVenueUpdates: Record<string, any> = {
          venue_url_last_checked_at: new Date().toISOString(),
        };
        let newVenueUrl: string | null = null;
        let newFieldMapUrl: string | null = null;
        let appliedFieldMapIdForQueue: number | null = null;

        if (shouldApplyVenueUrl) {
          newVenueUrl = suggestedVenueUrl;
          nextVenueUpdates.venue_url = suggestedVenueUrl;
          nextVenueUpdates.venue_url_quality = "good";
        }

        if (shouldApplyFieldMapUrl) {
          // Only set newFieldMapUrl if we actually update the cached `venues.field_map_url` (primary).
          newFieldMapUrl = suggestedSetPrimary ? suggestedFieldMapUrl : null;

          const mapHash = suggestedFieldMapUrl ? hashUrlSha256Hex(suggestedFieldMapUrl) : null;
          const { data: existingMapsRaw, error: existingMapsErr } = await supabaseAdmin
            .from("venue_field_maps" as any)
            .select("id,is_primary,map_hash")
            .eq("venue_id", venueId)
            .limit(50);

          if (existingMapsErr) {
            console.error("field-maps apply: failed to load existing maps", { venueId, existingMapsErr });
            errored += 1;
            continue;
          }

          const existingMaps = ((existingMapsRaw ?? []) as any[]).map((m) => ({
            id: Number(m.id),
            is_primary: Boolean(m.is_primary),
            map_hash: (m.map_hash ?? null) as string | null,
          }));

          const alreadyExists =
            mapHash && existingMaps.some((m) => (m.map_hash ?? null) === mapHash);

          let appliedMapId: number | null = null;
          if (!alreadyExists) {
            const { data: inserted, error: insertErr } = await supabaseAdmin
              .from("venue_field_maps" as any)
              .insert({
                venue_id: venueId,
                map_url: suggestedFieldMapUrl,
                map_hash: mapHash,
                map_source: queue.suggested_field_map_source ?? null,
                map_confidence: queue.suggested_field_map_confidence ?? null,
                map_type: queue.suggested_field_map_type ?? null,
                sport: suggestedFieldMapSport,
                is_primary: false,
              })
              .select("id")
              .maybeSingle();

            if (insertErr || !inserted) {
              console.error("field-maps apply: insert failed", { venueId, insertErr });
              errored += 1;
              continue;
            }
            appliedMapId = Number((inserted as any).id);
            appliedFieldMapIdForQueue = appliedMapId;

            const { error: mapsAuditErr } = await supabaseAdmin.from("venue_field_maps_audit_log" as any).insert({
              venue_id: venueId,
              event_type: "insert",
              map_id: appliedMapId,
              map_url: suggestedFieldMapUrl,
              actor: admin.id,
              reason: "applied from venue_url_review_queue",
            });
            if (mapsAuditErr) {
              console.error("field-maps apply: map audit insert failed", { venueId, mapsAuditErr });
            }
          }

          if (suggestedSetPrimary) {
            // Unset any existing primary, then set the new map primary.
            await supabaseAdmin.from("venue_field_maps" as any).update({ is_primary: false }).eq("venue_id", venueId).eq("is_primary", true);
            if (appliedMapId) {
              await supabaseAdmin.from("venue_field_maps" as any).update({ is_primary: true }).eq("id", appliedMapId);
            }

            // Cache the primary map back onto venues for legacy surfaces.
            nextVenueUpdates.field_map_url = suggestedFieldMapUrl;
            nextVenueUpdates.field_map_source = (queue.suggested_field_map_source ?? null) as string | null;
            nextVenueUpdates.field_map_confidence = (queue.suggested_field_map_confidence ?? null) as string | null;
            nextVenueUpdates.field_map_type = (queue.suggested_field_map_type ?? null) as string | null;
            nextVenueUpdates.field_map_hash = suggestedFieldMapUrl ? hashUrlSha256Hex(suggestedFieldMapUrl) : null;
            nextVenueUpdates.field_map_last_checked_at = new Date().toISOString();

            const { error: mapsAuditErr } = await supabaseAdmin.from("venue_field_maps_audit_log" as any).insert({
              venue_id: venueId,
              event_type: "set_primary",
              map_id: appliedMapId,
              map_url: suggestedFieldMapUrl,
              actor: admin.id,
              reason: "set primary from venue_url_review_queue",
            });
            if (mapsAuditErr) {
              console.error("field-maps apply: primary audit insert failed", { venueId, mapsAuditErr });
            }
          }

          // Persist the inserted map id onto the queue row for traceability.
          if (appliedMapId) appliedFieldMapIdForQueue = appliedMapId;
        }

        const { error: venueUpdateErr } = await supabaseAdmin.from("venues" as any).update(nextVenueUpdates).eq("id", venueId);
        if (venueUpdateErr) {
          console.error("field-maps apply: venue update failed", { venueId, venueUpdateErr });
          errored += 1;
          continue;
        }

        const reason = "applied from venue_url_review_queue";
        const { error: auditErr } = await supabaseAdmin.from("venue_url_audit_log" as any).insert({
          venue_id: venueId,
          event_type: "apply",
          previous_venue_url: liveVenueUrl,
          new_venue_url: newVenueUrl,
          previous_field_map_url: liveFieldMapUrl,
          new_field_map_url: newFieldMapUrl,
          actor: admin.id,
          reason,
        });
        if (auditErr) {
          console.error("field-maps apply: audit insert failed", { venueId, auditErr });
          // Non-fatal: venue updates already applied; keep going.
        }

        const { error: queueUpdateErr } = await supabaseAdmin
          .from("venue_url_review_queue" as any)
          .update({
            status: "applied",
            previous_venue_url: liveVenueUrl,
            previous_field_map_url: liveFieldMapUrl,
            applied_field_map_id: appliedFieldMapIdForQueue,
            reviewed_by: admin.id,
            last_reviewed_at: new Date().toISOString(),
          })
          .eq("venue_id", venueId);
        if (queueUpdateErr) {
          console.error("field-maps apply: queue update failed", { venueId, queueUpdateErr });
          // Non-fatal.
        }

        applied += 1;
      }

      revalidatePath(basePath);
      revalidatePath("/admin/venues");
      return redirectWithNotice(
        adminBase,
        `Apply complete. applied=${applied}, stale=${stale}, skipped=${skipped}, errored=${errored}.`
      );
    }

    return redirectWithNotice(adminBase, "Unknown bulk action.");
  }

  const { error: poiProbeErr } = await supabaseAdmin
    .from("venue_url_review_queue" as any)
    .select("poi_hints_json", { head: true, count: "exact" } as any);
  const supportsPoiHints = !poiProbeErr;

  const selectClause =
    "venue_id,status,bad_venue_url_reason,current_venue_url,current_field_map_url,suggested_venue_url,suggested_field_map_url,suggested_field_map_source,suggested_field_map_confidence,suggested_field_map_type,suggested_field_map_sport,suggested_field_map_set_primary,applied_field_map_id,generated_map_object_path,generated_map_url,generated_map_hash,generated_map_version,generated_map_source,approve_generated_map,generated_map_applied_id,generation_attempt_count,generation_error,generated_at," +
    (supportsPoiHints ? "poi_hints_json,poi_hints_source,poi_hints_fetched_at,poi_hints_error," : "") +
    "approve_venue_url,approve_field_map_url,override_good_venue_url,notes,updated_at,venues:venues(id,name,address,city,state,zip,latitude,longitude,venue_url,field_map_url,venue_url_quality)";

  const buildBaseQuery = () => {
    let qb = supabaseAdmin
      .from("venue_url_review_queue" as any)
      .select(selectClause)
      .order("updated_at", { ascending: false });
    if (status !== "all") qb = qb.eq("status", status);
    return qb;
  };

  let rowsRaw: any[] | null = null;
  let error: any = null;

  if (!q) {
    const { data, error: err } = await buildBaseQuery().range(offset, offset + limit - 1);
    rowsRaw = (data ?? []) as any[];
    error = err;
  } else {
    // PostgREST can't OR across multiple tables. To keep search useful, we run:
    // - one query searching queue URL fields
    // - one query searching the joined venues fields (referencedTable='venues')
    // then union + sort in memory (offset is ignored in search mode).
    const safe = q.replace(/%/g, "\\%").replace(/_/g, "\\_");

    const queueFilters = [`current_venue_url.ilike.%${safe}%`, `suggested_field_map_url.ilike.%${safe}%`].join(",");
    const venueFilters = [`name.ilike.%${safe}%`, `city.ilike.%${safe}%`, `state.ilike.%${safe}%`, `zip.ilike.%${safe}%`].join(",");

    const [queueRes, venueRes] = await Promise.all([
      buildBaseQuery().or(queueFilters).limit(limit),
      buildBaseQuery().or(venueFilters, { referencedTable: "venues" }).limit(limit),
    ]);

    if (queueRes.error) {
      console.error("field-maps: query failed (queue search)", queueRes.error);
      error = queueRes.error;
    }
    if (venueRes.error) {
      console.error("field-maps: query failed (venue search)", venueRes.error);
      error = venueRes.error;
    }

    const merged = new Map<string, any>();
    for (const r of ((queueRes.data ?? []) as any[]).concat((venueRes.data ?? []) as any[])) {
      merged.set(String(r.venue_id), r);
    }
    rowsRaw = Array.from(merged.values()).sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  }

  if (error) {
    console.error("field-maps: query failed", error);
  }

  // PostgREST embed shapes vary (object vs array) depending on relationship hints.
  // Normalize to a single `venues` object and then backfill any missing embeds.
  const normalizedRows = ((rowsRaw ?? []) as any[]).map((r) => {
    const embedded = (r as any).venues;
    const venue = Array.isArray(embedded) ? embedded[0] ?? null : embedded ?? null;
    return { ...(r as any), venues: venue };
  });

  const missingVenueIds = normalizedRows
    .filter((r) => !(r as any).venues)
    .map((r) => String((r as any).venue_id))
    .filter(Boolean);

  if (missingVenueIds.length) {
    const { data: venuesRaw, error: venuesErr } = await supabaseAdmin
      .from("venues" as any)
      .select("id,name,address,city,state,zip,venue_url,field_map_url,venue_url_quality,latitude,longitude")
      .in("id", missingVenueIds.slice(0, 5000));
    if (venuesErr) {
      console.error("field-maps: failed to backfill venues embeds", venuesErr);
    } else {
      const byId = new Map<string, any>();
      for (const v of (venuesRaw ?? []) as any[]) byId.set(String((v as any).id), v);
      for (const r of normalizedRows) {
        if ((r as any).venues) continue;
        const v = byId.get(String((r as any).venue_id)) ?? null;
        if (v) (r as any).venues = v;
      }
    }
  }

  const rows = normalizedRows as unknown as QueueRow[];
  const errCode = String((error as any)?.code ?? "");
  const errMsg = String((error as any)?.message ?? "");
  const schemaMissing =
    Boolean(error) &&
    (errCode === "PGRST205" ||
      errCode === "42703" ||
      errMsg.includes("schema cache") ||
      errMsg.includes("does not exist"));

  const StatusLink = ({ value, label }: { value: QueueStatus | "all"; label: string }) => {
    const active = value === status;
    const count =
      value === "all"
        ? queueStatusCounts.total
        : (queueStatusCounts.counts[String(value)] ?? null);
    const labelWithCount = count === null ? label : `${label} (${count})`;
    return (
      <Link
        // Reset pagination when switching status so we don't land on an empty page
        // (counts are global, but the table is paginated by offset/limit).
        href={buildHref({ status: value === "pending" ? null : value, offset: "0" })}
        style={{
          padding: "6px 10px",
          borderRadius: 999,
          border: `1px solid ${active ? "#0f172a" : "#d1d5db"}`,
          background: active ? "#eef2ff" : "#fff",
          color: "#111",
          fontWeight: 800,
          fontSize: 12,
          textDecoration: "none",
        }}
      >
        {labelWithCount}
      </Link>
    );
  };

  return (
    <div style={{ padding: 24, width: "100%", boxSizing: "border-box" }}>
      <AdminNav />

      {(notice || schemaMissing) ? (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            marginTop: 10,
            marginBottom: 12,
            paddingTop: 10,
            paddingBottom: 10,
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            borderRadius: 14,
            boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
            border: "1px solid #e5e7eb",
          }}
          aria-live="polite"
        >
          {notice ? (
            <div style={{ padding: "0 12px" }}>
              <div style={{ padding: "10px 12px", borderRadius: 12, background: "#ecfeff", border: "1px solid #67e8f9" }}>
                <strong>Notice:</strong> {notice}
              </div>
            </div>
          ) : null}
          {schemaMissing ? (
            <div style={{ padding: "0 12px", marginTop: notice ? 10 : 0 }}>
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 14,
                  background: "#fff7ed",
                  border: "1px solid #fdba74",
                  color: "#7c2d12",
                }}
              >
                <div style={{ fontWeight: 900 }}>{schemaHelp.title}</div>
                <div style={{ marginTop: 6, fontSize: 13, whiteSpace: "pre-wrap" }}>{schemaHelp.body}</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Venue field maps</h1>
          <p style={{ margin: "6px 0 0 0", color: "#4b5563" }}>
            Queue-based review for `field_map_url` (and optional `venue_url`), with bulk approve/apply.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href="/admin/venues"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "#fff",
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 900,
              color: "#111827",
            }}
          >
            Back to venues
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <StatusLink value="pending" label="Pending" />
        <StatusLink value="suggested" label="Suggested" />
        <StatusLink value="manual_review" label="Manual review" />
        <StatusLink value="approved" label="Approved" />
        <StatusLink value="applied" label="Applied" />
        <StatusLink value="error" label="Error" />
        <StatusLink value="all" label="All" />
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[
          { label: "Total venues", value: coverage ? String(coverage.total) : "—" },
          { label: "Venues with field maps", value: coverage ? String(coverage.withMaps) : "—" },
          { label: "Venues without field maps", value: coverage ? String(coverage.withoutMapsNotSkipped) : "—", sub: "(excludes skipped)" },
        ].map((b) => (
          <div key={b.label} style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 14, padding: "10px 12px", minWidth: 220 }}>
            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900 }}>
              {b.label} {b.sub ? <span style={{ fontWeight: 800, color: "#9ca3af" }}>{b.sub}</span> : null}
            </div>
            <div style={{ marginTop: 2, fontSize: 22, fontWeight: 950, color: "#111827" }}>{b.value}</div>
          </div>
        ))}
      </div>

      <form action={seedQueueAction} style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fafafa" }}>
        <input type="hidden" name="redirect_to" value={buildHref({})} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="submit"
            disabled={schemaMissing}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #0f766e",
              background: "#fff",
              color: "#0f766e",
              fontWeight: 900,
              opacity: schemaMissing ? 0.5 : 1,
              cursor: schemaMissing ? "not-allowed" : "pointer",
            }}
          >
            Seed queue (tournament-linked)
          </button>
          <label style={{ fontSize: 12, color: "#374151", display: "inline-flex", gap: 6, alignItems: "center" }}>
            Limit
            <input
              name="seed_limit"
              type="number"
              min={1}
              max={2000}
              defaultValue={200}
              style={{ width: 90, padding: "6px 8px", borderRadius: 10, border: "1px solid #d1d5db" }}
            />
          </label>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            Inserts into `venue_url_review_queue` with `ON CONFLICT DO NOTHING` (won&apos;t reset existing review state).
          </span>
        </div>
      </form>

      <form
        action={autoSkipSchoolVenuesAction}
        style={{ marginTop: 12, border: "1px solid #fee2e2", borderRadius: 14, padding: 14, background: "#fff7f7" }}
      >
        <input type="hidden" name="redirect_to" value={buildHref({})} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="submit"
            disabled={schemaMissing}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: "#b00020",
              color: "#fff",
              fontWeight: 900,
              opacity: schemaMissing ? 0.5 : 1,
              cursor: schemaMissing ? "not-allowed" : "pointer",
            }}
          >
            Auto-skip Middle/Elementary venues
          </button>
          <label style={{ fontSize: 12, color: "#374151", display: "inline-flex", gap: 6, alignItems: "center" }}>
            Limit
            <input
              name="skip_limit"
              type="number"
              min={1}
              max={5000}
              defaultValue={1500}
              style={{ width: 90, padding: "6px 8px", borderRadius: 10, border: "1px solid #d1d5db" }}
            />
          </label>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            Marks queue rows as `skipped` (does not delete venues). Skips venues that already have maps.
          </span>
        </div>
      </form>

      <form
        action={autoSkipIndoorSingleUseVenuesAction}
        style={{ marginTop: 12, border: "1px solid #e0e7ff", borderRadius: 14, padding: 14, background: "#eef2ff" }}
      >
        <input type="hidden" name="redirect_to" value={buildHref({})} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="submit"
            disabled={schemaMissing}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #3730a3",
              background: "#fff",
              color: "#3730a3",
              fontWeight: 900,
              opacity: schemaMissing ? 0.5 : 1,
              cursor: schemaMissing ? "not-allowed" : "pointer",
            }}
          >
            Auto-skip indoor / basketball / volleyball / hockey
          </button>
          <label style={{ fontSize: 12, color: "#374151", display: "inline-flex", gap: 6, alignItems: "center" }}>
            Limit
            <input
              name="skip_indoor_limit"
              type="number"
              min={1}
              max={10000}
              defaultValue={2000}
              style={{ width: 90, padding: "6px 8px", borderRadius: 10, border: "1px solid #d1d5db" }}
            />
          </label>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            Marks queue rows as <code>skipped</code> (does not delete). Protects venues that already have maps.
          </span>
        </div>
      </form>

      <form
        method="get"
        action={basePath}
        style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
      >
        <input
          name="q"
          placeholder="Search venue / city / url"
          defaultValue={q}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            flex: "1 1 320px",
            minWidth: 220,
          }}
        />
        <select
          name="status"
          defaultValue={status}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            flex: "0 1 180px",
            minWidth: 160,
          }}
        >
          <option value="pending">pending</option>
          <option value="suggested">suggested</option>
          <option value="manual_review">manual_review</option>
          <option value="approved">approved</option>
          <option value="applied">applied</option>
          <option value="skipped">skipped</option>
          <option value="error">error</option>
          <option value="all">all</option>
        </select>
        <select
          name="engine"
          defaultValue={engine}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            flex: "0 1 180px",
            minWidth: 160,
          }}
        >
          <option value="brave">Brave search</option>
          <option value="google">Google CSE</option>
        </select>
        <select
          name="discover_mode"
          defaultValue={discoverMode}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            flex: "0 1 180px",
            minWidth: 160,
          }}
        >
          <option value="broad">Discover: broad</option>
          <option value="strict">Discover: strict</option>
        </select>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "#374151", fontSize: 12 }}>
          Limit
          <input name="limit" type="number" min={1} max={200} defaultValue={limit} style={{ width: 80, padding: "6px 8px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
        </label>
        <button type="submit" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "#fff", fontWeight: 900 }}>
          Filter
        </button>
      </form>

      <form id="field-maps-bulk-form" action={bulkQueueAction} style={{ marginTop: 18 }}>
        <input type="hidden" name="redirect_to" value={buildHref({})} />
        <input type="hidden" name="engine" value={engine} />
        <input type="hidden" name="discover_mode" value={discoverMode} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <button
            formNoValidate
            name="bulk_action"
            value="generate_draft_pngs"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111827",
              background: "#fff",
              color: "#111827",
              fontWeight: 900,
            }}
          >
            Generate draft PNGs
          </button>
          <button
            formNoValidate
            name="bulk_action"
            value="regenerate_draft_pngs"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              fontWeight: 900,
            }}
          >
            Regenerate draft PNGs (force)
          </button>
          <span style={{ alignSelf: "center", fontSize: 12, color: "#6b7280" }}>
            Uses `MAPBOX_ACCESS_TOKEN` + Storage bucket `SUPABASE_VENUE_MAPS_BUCKET` (default: `venue-maps`).
          </span>
          <button
            formNoValidate
            name="bulk_action"
            value="approve_generated"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #0a7a2f",
              background: "#fff",
              color: "#0a7a2f",
              fontWeight: 900,
            }}
          >
            Approve generated
          </button>
          <button
            formNoValidate
            name="bulk_action"
            value="approve_maps"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: "#0a7a2f",
              color: "#fff",
              fontWeight: 900,
            }}
          >
            Approve selected maps
          </button>
          <span style={{ alignSelf: "center", fontSize: 12, color: "#6b7280" }}>
            Approve/apply only works once `suggested_field_map_url` is filled in (use `Edit`).
          </span>
          <button
            formNoValidate
            name="bulk_action"
            value="discover_maps"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #0f766e",
              background: "#fff",
              color: "#0f766e",
              fontWeight: 900,
            }}
          >
            Discover maps (bulk)
          </button>
          <span style={{ alignSelf: "center", fontSize: 12, color: "#6b7280" }}>
            Uses {engine === "google" ? "`GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_CX`" : "`BRAVE_SEARCH_KEY`"}; runs sequentially with throttling.
          </span>
          <button
            formNoValidate
            name="bulk_action"
            value="apply_selected"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #1d4ed8",
              background: "#fff",
              color: "#1d4ed8",
              fontWeight: 900,
            }}
          >
            Apply selected (approved)
          </button>
          <button
            formNoValidate
            name="bulk_action"
            value="mark_not_found"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #6b7280",
              background: "#fff",
              color: "#374151",
              fontWeight: 900,
            }}
          >
            Mark not found (skip)
          </button>
          <button
            formNoValidate
            name="bulk_action"
            value="delete_queue_rows"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #b00020",
              background: "#fff",
              color: "#b00020",
              fontWeight: 900,
            }}
          >
            Remove from queue
          </button>
        </div>

        <div style={{ marginBottom: 14, padding: 12, borderRadius: 14, border: "1px solid #e5e7eb", background: "#fafafa" }}>
          <div style={{ fontWeight: 950, color: "#111827" }}>Notes</div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#374151", display: "grid", gap: 6 }}>
            <div>
              <span style={{ fontWeight: 900 }}>Generated PNGs</span>: Mapbox Static Images with baked overlays + attribution. Treat as “Generated (approximate)”, never official.
            </div>
            <div>
              <span style={{ fontWeight: 900 }}>Common gen errors</span>: <code>missing_coords</code>, <code>bad_coords:*</code> (coord validation), <code>suspect_png_size:*</code> (base map likely failed → wrong/blank center), <code>storage_upload_failed</code>.
            </div>
            <div>
              <span style={{ fontWeight: 900 }}>Coord validation</span>: enable with <code>ENABLE_VENUE_COORD_VALIDATION=true</code>. Soft mismatches add a warning in notes; hard mismatches go to <code>manual_review</code>. Per-venue bypass toggle is available on the Edit page when the bypass migration is applied.
            </div>
            <div>
              <span style={{ fontWeight: 900 }}>OSM pitch centering</span>: enable with <code>ENABLE_OSM_PITCH_CENTERING=true</code>. If OSM has no mapped pitches nearby, centering falls back to venue lat/lng.
            </div>
            <div>
              <span style={{ fontWeight: 900 }}>Discover</span>: prefers PDFs/images and common “field map” slugs; blocks Google/Apple/Waze map links; uses throttling and may infer an official host when <code>venues.venue_url</code> is missing.
            </div>
            <div>
              <span style={{ fontWeight: 900 }}>Search engines</span>: default engine is selected above. If you run <code>Brave search</code> and Google CSE is configured (<code>GOOGLE_CSE_API_KEY</code> + <code>GOOGLE_CSE_CX</code>), Discover will auto-try a small Google fallback on <code>no_match</code> to catch PDF-heavy sites (e.g. SportNGIN attachments).
            </div>
          </div>
        </div>
      </form>

      <div id="field-maps-table" style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: 10, textAlign: "left" }}>
                  <div style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                    <SelectAllOnPage containerId="field-maps-table" />
                    <span>Select</span>
                  </div>
                </th>
                <th style={{ padding: 10, textAlign: "left" }}>Venue</th>
                <th style={{ padding: 10, textAlign: "left" }}>Status</th>
                <th style={{ padding: 10, textAlign: "left" }}>Current</th>
                <th style={{ padding: 10, textAlign: "left" }}>Suggested</th>
                <th style={{ padding: 10, textAlign: "left" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 14, color: "#6b7280" }}>
                    {error ? "Failed to load queue rows." : "No queue rows found for this filter."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const venue = row.venues;
                  const title = venue?.name ?? row.venue_id;
                  const addressLine = String(venue?.address ?? "").trim();
                  const meta = [venue?.city, venue?.state, venue?.zip].filter(Boolean).join(", ");
                  const currentMap = row.current_field_map_url ?? venue?.field_map_url ?? null;
                  const suggestedMap = row.suggested_field_map_url ?? null;
                  const generatedMap = (row as any).generated_map_url ?? null;
                  const mapLink = suggestedMap || generatedMap || currentMap;
                  const sport = (row as any).suggested_field_map_sport ?? null;
                  const setPrimary = Boolean((row as any).suggested_field_map_set_primary);
                  const discoverIndicator = inferDiscoverIndicator(row.notes ?? null);

                  return (
                    <tr key={row.venue_id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: 10, verticalAlign: "top" }}>
                        <input
                          data-field-maps-item="1"
                          form="field-maps-bulk-form"
                          type="checkbox"
                          name="selected"
                          value={row.venue_id}
                          aria-label={`Select ${title}`}
                        />
                      </td>
                      <td style={{ padding: 10, verticalAlign: "top", minWidth: 220 }}>
                        <div style={{ fontWeight: 900 }}>{title}</div>
                        {addressLine ? (
                          <div style={{ marginTop: 2, color: "#6b7280" }}>{addressLine}</div>
                        ) : null}
                        <div style={{ marginTop: 2, color: "#6b7280" }}>{meta || "—"}</div>
                        <div style={{ marginTop: 6 }}>
                          <Link href={`/admin/venues/${row.venue_id}`} style={{ color: "#2563eb", fontWeight: 800, textDecoration: "none" }}>
                            Venue →
                          </Link>
                        </div>
                      </td>
                      <td style={{ padding: 10, verticalAlign: "top", minWidth: 120 }}>
                        <div style={{ fontWeight: 900 }}>{row.status}</div>
                        {row.approve_field_map_url ? (
                          <div style={{ marginTop: 4, fontSize: 12, color: "#0a7a2f", fontWeight: 900 }}>map approved</div>
                        ) : null}
                        {(row as any).approve_generated_map ? (
                          <div style={{ marginTop: 4, fontSize: 12, color: "#0a7a2f", fontWeight: 900 }}>generated approved</div>
                        ) : null}
                        {!(row as any).approve_generated_map && (row as any).generated_map_url ? (
                          <div style={{ marginTop: 4, fontSize: 12, color: "#111827", fontWeight: 900 }}>generated draft</div>
                        ) : null}
                        {(row as any).generation_error ? (
                          <div style={{ marginTop: 4, fontSize: 12, color: "#b00020", fontWeight: 900 }}>
                            gen error: {(row as any).generation_error}
                          </div>
                        ) : null}
                        {row.override_good_venue_url ? (
                          <div style={{ marginTop: 4, fontSize: 12, color: "#b45309", fontWeight: 900 }}>override good URL</div>
                        ) : null}
                        {discoverIndicator ? (
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 12,
                              fontWeight: 900,
                              color: discoverIndicator.tone === "ok" ? "#0a7a2f" : "#b45309",
                            }}
                          >
                            {discoverIndicator.label}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ padding: 10, verticalAlign: "top", minWidth: 320 }}>
                        <div style={{ color: "#111827", fontWeight: 800, marginBottom: 4 }}>field_map_url</div>
                        {currentMap ? (
                          <a href={currentMap} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", wordBreak: "break-word" }}>
                            {currentMap}
                          </a>
                        ) : (
                          <div style={{ color: "#6b7280" }}>—</div>
                        )}
                        <div style={{ marginTop: 10, color: "#111827", fontWeight: 800, marginBottom: 4 }}>venue_url</div>
                        {row.current_venue_url ? (
                          <a href={row.current_venue_url} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", wordBreak: "break-word" }}>
                            {row.current_venue_url}
                          </a>
                        ) : (
                          <div style={{ color: "#6b7280" }}>—</div>
                        )}
                      </td>
                      <td style={{ padding: 10, verticalAlign: "top", minWidth: 340 }}>
                        <div style={{ color: "#111827", fontWeight: 800, marginBottom: 4 }}>suggested_field_map_url</div>
                        {suggestedMap ? (
                          <a href={suggestedMap} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", wordBreak: "break-word" }}>
                            {suggestedMap}
                          </a>
                        ) : (
                          <div style={{ color: "#6b7280" }}>—</div>
                        )}
                        <div style={{ marginTop: 10, color: "#111827", fontWeight: 800, marginBottom: 4 }}>generated_map_url</div>
                        {(row as any).generated_map_url ? (
                          <a href={(row as any).generated_map_url} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", wordBreak: "break-word" }}>
                            {(row as any).generated_map_url}
                          </a>
                        ) : (
                          <div style={{ color: "#6b7280" }}>—</div>
                        )}
                        <div style={{ marginTop: 10, color: "#111827", fontWeight: 800, marginBottom: 4 }}>POI hints (optional)</div>
                        {(row as any).poi_hints_json ? (
                          <div style={{ fontSize: 12, color: "#374151" }}>
                            <div>
                              {(row as any).poi_hints_source ? <span style={{ fontWeight: 900 }}>{String((row as any).poi_hints_source)}</span> : null}
                              {(row as any).poi_hints_fetched_at ? (
                                <span style={{ color: "#6b7280" }}> • {new Date(String((row as any).poi_hints_fetched_at)).toLocaleString()}</span>
                              ) : null}
                            </div>
                            <div style={{ marginTop: 4, color: "#111827" }}>
                              {Object.entries(((row as any).poi_hints_json?.counts ?? {}) as Record<string, number>)
                                .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                                .slice(0, 6)
                                .map(([k, v]) => `${k}=${v}`)
                                .join(" • ") || "—"}
                            </div>
                          </div>
                        ) : (row as any).poi_hints_error ? (
                          <div style={{ fontSize: 12, color: "#b00020", fontWeight: 800 }}>
                            {(row as any).poi_hints_error}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: "#6b7280" }}>—</div>
                        )}
                        <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px dashed #e5e7eb", background: "#fcfcfd" }}>
                          <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>Quick paste</div>
                          <form action={quickPasteApproveAction} style={{ marginTop: 8, display: "grid", gap: 10 }}>
                            <input type="hidden" name="redirect_to" value={buildHref({})} />
                            <input type="hidden" name="venue_id" value={row.venue_id} />
                            <input
                              name="map_url"
                              placeholder="Paste map URL…"
                              defaultValue=""
                              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                            />
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                              <input
                                name="sport"
                                placeholder="sport (optional)"
                                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", width: 160 }}
                              />
                              <label
                                style={{
                                  display: "inline-flex",
                                  gap: 8,
                                  alignItems: "center",
                                  fontSize: 12,
                                  color: "#0a7a2f",
                                  fontWeight: 900,
                                }}
                              >
                                <input type="checkbox" name="set_primary" />
                                Set primary
                              </label>
                            </div>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              <button
                                formNoValidate
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: "1px solid #0a7a2f",
                                  background: "#fff",
                                  color: "#0a7a2f",
                                  fontWeight: 900,
                                }}
                              >
                                Paste + approve
                              </button>
                              <button
                                formNoValidate
                                formAction={quickPasteApplyAction}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: "1px solid #1d4ed8",
                                  background: "#fff",
                                  color: "#1d4ed8",
                                  fontWeight: 900,
                                }}
                              >
                                Paste + apply
                              </button>
                              <button
                                formNoValidate
                                formAction={quickApproveSuggestedAction}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: "1px solid #111827",
                                  background: "#fff",
                                  color: "#111827",
                                  fontWeight: 900,
                                }}
                              >
                                Approve
                              </button>
                              <button
                                formNoValidate
                                formAction={quickMarkNotFoundAction}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: "1px solid #6b7280",
                                  background: "#fff",
                                  color: "#374151",
                                  fontWeight: 900,
                                }}
                              >
                                Not found
                              </button>
                            </div>
                          </form>
                          <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                            Multiple maps are stored in `venue_field_maps` (use sport to differentiate). “Set primary” caches to `venues.field_map_url`.
                          </div>
                        </div>
                        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {sport ? (
                            <span style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>sport: {sport}</span>
                          ) : null}
                          {setPrimary ? (
                            <span style={{ fontSize: 12, fontWeight: 900, color: "#0a7a2f" }}>primary</span>
                          ) : null}
                          {row.suggested_field_map_confidence ? (
                            <span style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                              conf: {row.suggested_field_map_confidence}
                            </span>
                          ) : null}
                          {row.suggested_field_map_type ? (
                            <span style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                              type: {row.suggested_field_map_type}
                            </span>
                          ) : null}
                          {row.suggested_field_map_source ? (
                            <span style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                              src: {row.suggested_field_map_source}
                            </span>
                          ) : null}
                        </div>
                        {row.notes ? (
                          <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280", whiteSpace: "pre-wrap" }}>{row.notes}</div>
                        ) : null}
                      </td>
                      <td style={{ padding: 10, verticalAlign: "top", minWidth: 180 }}>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <Link href={`/admin/venues/field-maps/${row.venue_id}`} style={{ color: "#111827", fontWeight: 900, textDecoration: "none" }}>
                            Edit
                          </Link>
                          {mapLink ? (
                            <a href={mapLink} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: 900, textDecoration: "none" }}>
                              Open map
                            </a>
                          ) : (
                            <span style={{ color: "#9ca3af", fontWeight: 800 }}>Open map</span>
                          )}
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                          Updated {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ color: "#6b7280", fontSize: 12 }}>
          Showing {rows.length} row(s) • offset {offset} • limit {limit}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href={buildHref({ offset: String(Math.max(0, offset - limit)) })}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 900,
              color: "#111827",
              background: "#fff",
              opacity: offset > 0 ? 1 : 0.5,
              pointerEvents: offset > 0 ? "auto" : "none",
            }}
          >
            Prev
          </Link>
          <Link
            href={buildHref({ offset: String(offset + limit) })}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 900,
              color: "#111827",
              background: "#fff",
            }}
          >
            Next
          </Link>
        </div>
      </div>
    </div>
  );
}
