import { createHmac } from "node:crypto";

import { normalizeVenueComparable } from "./venueMatching";

export const CORRALIO_OVERTURE_MATCH_RULE_VERSION = "corralio-overture-match-v1";
export const CORRALIO_OVERTURE_RADIUS_METERS = 4_828;
export const CORRALIO_OVERTURE_PROVISIONAL_CONFIDENCE_FLOOR = 0.7;
export const CORRALIO_OVERTURE_PROVISIONAL_POOL_CAP = 15;

export const CORRALIO_OVERTURE_STAGE1_BOUNDS = Object.freeze({
  maxVenues: 10,
  maxBoxes: 10,
  maxDownloadedBytes: 64 * 1024 * 1024,
  maxCandidatesExamined: 10_000,
  maxCandidatesPerCategory: CORRALIO_OVERTURE_PROVISIONAL_POOL_CAP,
  maxDurationSeconds: 60,
  maxConcurrency: 1,
});

export type OverturePoolCategory = "food" | "coffee";
export type OvertureSource = {
  property: string | null;
  dataset: string;
  recordId: string | null;
  updateTime: string | null;
};
export type OverturePlace = {
  featureId: string;
  featureVersion: number;
  release: string;
  name: string;
  basicCategory: string | null;
  taxonomyPrimary: string | null;
  taxonomyHierarchy: readonly string[];
  existenceConfidence: number | null;
  latitude: number;
  longitude: number;
  address: string | null;
  locality: string | null;
  sources: readonly OvertureSource[];
  gersConfirmed?: boolean;
};
export type SharedVenue = {
  name: string;
  normalizedAddress: string | null;
  locality: string;
  latitude: number;
  longitude: number;
};

const LICENSE_BY_DATASET: Readonly<Record<string, "CDLA-Permissive-2.0" | "CC0-1.0">> = {
  alltheplaces: "CC0-1.0",
  overture: "CDLA-Permissive-2.0",
  brightquery: "CDLA-Permissive-2.0",
  dac: "CDLA-Permissive-2.0",
  krick: "CDLA-Permissive-2.0",
  microsoft: "CDLA-Permissive-2.0",
  pinmeto: "CDLA-Permissive-2.0",
  renderseo: "CDLA-Permissive-2.0",
  meta: "CDLA-Permissive-2.0",
};

function finiteCoordinate(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max;
}

export function classifyOvertureCategory(place: OverturePlace): OverturePoolCategory | null {
  const categories = new Set([
    place.basicCategory,
    place.taxonomyPrimary,
    ...place.taxonomyHierarchy,
  ].filter((value): value is string => typeof value === "string"));
  if (categories.has("coffee_shop") || categories.has("cafe")) return "coffee";
  if (categories.has("food_and_drink") || categories.has("restaurant") || categories.has("casual_eatery")) return "food";
  return null;
}

export function normalizeOvertureProvenance(sources: readonly OvertureSource[]) {
  const normalized = sources.map((source) => {
    const dataset = source.dataset.trim().toLowerCase();
    if (!dataset || dataset === "foursquare") return null;
    const licenseId = LICENSE_BY_DATASET[dataset];
    if (!licenseId) return null;
    return {
      propertyName: source.property?.trim() || null,
      dataset,
      licenseId,
      sourceRecordId: source.recordId?.trim() || null,
      sourceUpdateTime: source.updateTime,
    };
  });
  if (!normalized.length || normalized.some((source) => source === null)) return null;
  return normalized as Array<NonNullable<(typeof normalized)[number]>>;
}

export function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadius = 6_371_008.8;
  const dLat = radians(to.latitude - from.latitude);
  const dLng = radians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function evaluateOvertureVenueMatch(venue: SharedVenue, places: readonly OverturePlace[]) {
  const qualifying = places.filter((place) => {
    if (!finiteCoordinate(place.latitude, -90, 90) || !finiteCoordinate(place.longitude, -180, 180)) return false;
    if (normalizeVenueComparable(place.name) !== normalizeVenueComparable(venue.name)) return false;
    if (normalizeVenueComparable(place.locality ?? "") !== normalizeVenueComparable(venue.locality)) return false;
    if (venue.normalizedAddress) {
      if (normalizeVenueComparable(place.address ?? "") !== venue.normalizedAddress) return false;
    }
    return distanceMeters(venue, place) <= 250;
  });
  return {
    ruleVersion: CORRALIO_OVERTURE_MATCH_RULE_VERSION,
    outcome: qualifying.length === 1 ? "matched" as const : qualifying.length > 1 ? "ambiguous" as const : "no_match" as const,
    place: qualifying.length === 1 ? qualifying[0] : null,
  };
}

export function selectOvertureCandidates(
  venue: Pick<SharedVenue, "latitude" | "longitude">,
  places: readonly OverturePlace[],
  options: { confidenceFloor?: number; cap?: number; radiusMeters?: number } = {},
) {
  const floor = options.confidenceFloor ?? CORRALIO_OVERTURE_PROVISIONAL_CONFIDENCE_FLOOR;
  const cap = options.cap ?? CORRALIO_OVERTURE_PROVISIONAL_POOL_CAP;
  const radius = options.radiusMeters ?? CORRALIO_OVERTURE_RADIUS_METERS;
  if (floor < 0 || floor > 1 || cap < 1 || cap > 50 || radius < 1 || radius > 4_829) {
    throw new Error("Invalid Overture selection bounds");
  }
  const byCategory = new Map<OverturePoolCategory, Map<string, { place: OverturePlace; distanceMeters: number }>>([
    ["food", new Map()],
    ["coffee", new Map()],
  ]);
  for (const place of places) {
    const category = classifyOvertureCategory(place);
    const provenance = normalizeOvertureProvenance(place.sources);
    if (!category || !provenance || place.existenceConfidence === null || place.existenceConfidence < floor) continue;
    if (!finiteCoordinate(place.latitude, -90, 90) || !finiteCoordinate(place.longitude, -180, 180)) continue;
    const distance = distanceMeters(venue, place);
    if (distance > radius) continue;
    const current = byCategory.get(category)!.get(place.featureId);
    if (!current || distance < current.distanceMeters) {
      byCategory.get(category)!.set(place.featureId, { place, distanceMeters: distance });
    }
  }
  return [...byCategory].flatMap(([category, rows]) =>
    [...rows.values()]
      .sort((a, b) => a.distanceMeters - b.distanceMeters
        || (b.place.existenceConfidence ?? 0) - (a.place.existenceConfidence ?? 0)
        || a.place.featureId.localeCompare(b.place.featureId))
      .slice(0, cap)
      .map((row) => ({ category, ...row })),
  );
}

export function buildOvertureEvidenceFingerprints(input: {
  key: string;
  provisionalVenueId: string;
  overtureFeatureId: string;
  release: string;
}) {
  if (input.key.trim().length < 32) throw new Error("Evidence fingerprint key must contain at least 32 characters");
  const digest = (domain: string) => createHmac("sha256", input.key)
    .update(["corralio-evidence-hmac-v1", domain, input.provisionalVenueId, input.overtureFeatureId, input.release].join("\0"))
    .digest("hex");
  return {
    observationFingerprint: digest("overture-place-match"),
    sourceScopeFingerprint: digest("overture-release-scope"),
  };
}

export function assertWithinOperationalBounds(input: {
  venues: number;
  boxes: number;
  downloadedBytes: number;
  candidatesExamined: number;
  elapsedSeconds: number;
  concurrency: number;
}, bounds = CORRALIO_OVERTURE_STAGE1_BOUNDS) {
  const exceeded = [
    input.venues > bounds.maxVenues && "max_venues",
    input.boxes > bounds.maxBoxes && "max_boxes",
    input.downloadedBytes > bounds.maxDownloadedBytes && "max_downloaded_bytes",
    input.candidatesExamined > bounds.maxCandidatesExamined && "max_candidates_examined",
    input.elapsedSeconds > bounds.maxDurationSeconds && "max_duration_seconds",
    input.concurrency > bounds.maxConcurrency && "max_concurrency",
  ].filter(Boolean);
  if (exceeded.length) throw new Error(`Overture operational bound exceeded: ${exceeded.join(",")}`);
}
