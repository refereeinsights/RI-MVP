import { createHmac } from "node:crypto";

import { normalizeVenueComparable } from "./venueMatching";

export const CORRALIO_OVERTURE_MATCH_RULE_VERSION = "corralio-overture-match-v1";
export const CORRALIO_OVERTURE_CANDIDATE_QUALITY_RULE_VERSION = "corralio-overture-candidate-quality-v1";
export const CORRALIO_OVERTURE_DEDUPE_RULE_VERSION = "corralio-overture-dedupe-v1";
export const CORRALIO_OVERTURE_RADIUS_METERS = 4_828;
export const CORRALIO_OVERTURE_PROVISIONAL_CONFIDENCE_FLOOR = 0.7;
export const CORRALIO_OVERTURE_PROVISIONAL_POOL_CAP = 15;
export const CORRALIO_OVERTURE_FOOD_DIVERSITY = Object.freeze({
  quickIntentAnchorEach: 1,
  otherFoodReserve: 3,
  breweryReserve: 1,
});

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
export type OvertureIntentCategory = "quick_service" | "pizza" | "sandwiches" | "coffee" | "brewery" | "other_food";
export type CorralioCandidateOperatingStatus = "confirmed_open" | "confirmed_closed" | "status_unknown";
export type OvertureSource = {
  property: string | null;
  dataset: string;
  license?: string | null;
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
  operatingStatus?: string | null;
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
  "overture-signals": "CDLA-Permissive-2.0",
};

const CLOSED_STATUSES = new Set(["closed", "inactive", "permanently_closed", "temporarily_closed"]);
const QUICK_SERVICE_CATEGORIES = new Set([
  "fast_food_restaurant", "fast_casual_restaurant", "burger_restaurant",
  "chicken_restaurant", "taco_restaurant", "burrito_restaurant",
  "hot_dog_restaurant", "food_court",
]);
const PIZZA_CATEGORIES = new Set(["pizza_restaurant", "pizzeria"]);
const SANDWICH_CATEGORIES = new Set(["sandwich_shop", "sub_shop", "deli"]);
const BREWERY_CATEGORIES = new Set(["brewery", "brewpub"]);
const EXCLUDED_PRIMARY_CATEGORIES = new Set([
  "bar", "pub", "liquor_store", "wine_store", "lounge", "nightclub",
  "hospital", "clinic", "medical_center", "senior_care", "real_estate_agent",
  "government_office", "city_hall",
]);
const CONTRADICTORY_NAME_PATTERNS = [
  /\b(?:clinic|medical|dental|dentist|orthodont\w*|pharmacy|hospital)\b/,
  /\b(?:realtor|real\s+estate|property\s+management)\b/,
  /\b(?:senior\s+helpers?|senior\s+care|home\s+care|assisted\s+living)\b/,
  /\b(?:township|municipality|city\s+hall|government\s+office)\b/,
  /\b(?:liquor|lotto|gas\s+and\s+more)\b/,
  /\b(?:llc|incorporated|corporation)\b/,
];

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

function placeCategories(place: OverturePlace) {
  return new Set([
    place.basicCategory,
    place.taxonomyPrimary,
    ...place.taxonomyHierarchy,
  ].filter((value): value is string => typeof value === "string").map((value) => value.trim().toLowerCase()));
}

export function normalizeCandidateOperatingStatus(value: string | null | undefined): CorralioCandidateOperatingStatus {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "open") return "confirmed_open";
  if (CLOSED_STATUSES.has(normalized)) return "confirmed_closed";
  return "status_unknown";
}

function intentCategory(place: OverturePlace, poolCategory: OverturePoolCategory): OvertureIntentCategory {
  if (poolCategory === "coffee") return "coffee";
  const categories = placeCategories(place);
  if ([...PIZZA_CATEGORIES].some((category) => categories.has(category))) return "pizza";
  if ([...SANDWICH_CATEGORIES].some((category) => categories.has(category))) return "sandwiches";
  if ([...BREWERY_CATEGORIES].some((category) => categories.has(category))) return "brewery";
  if ([...QUICK_SERVICE_CATEGORIES].some((category) => categories.has(category))) return "quick_service";
  return "other_food";
}

export type OvertureCandidateDecision = {
  accepted: boolean;
  poolCategory: OverturePoolCategory | null;
  intentCategory: OvertureIntentCategory | null;
  operatingStatus: CorralioCandidateOperatingStatus;
  reason: "accepted" | "not_food_or_coffee" | "excluded_provenance" | "missing_confidence"
    | "confidence_below_floor" | "confirmed_closed" | "excluded_structured_category"
    | "contradictory_identity" | "insufficient_identity" | "brewery_existence_uncertain";
  ruleVersion: typeof CORRALIO_OVERTURE_CANDIDATE_QUALITY_RULE_VERSION;
};

export function evaluateOvertureCandidate(
  place: OverturePlace,
  options: { confidenceFloor?: number } = {},
): OvertureCandidateDecision {
  const poolCategory = classifyOvertureCategory(place);
  const operatingStatus = normalizeCandidateOperatingStatus(place.operatingStatus);
  const reject = (reason: OvertureCandidateDecision["reason"], intent: OvertureIntentCategory | null = null) => ({
    accepted: false,
    poolCategory,
    intentCategory: intent,
    operatingStatus,
    reason,
    ruleVersion: CORRALIO_OVERTURE_CANDIDATE_QUALITY_RULE_VERSION,
  } as const);
  if (!poolCategory) return reject("not_food_or_coffee");
  const intent = intentCategory(place, poolCategory);
  if (!normalizeOvertureProvenance(place.sources)) return reject("excluded_provenance", intent);
  if (place.existenceConfidence === null) return reject("missing_confidence", intent);
  const floor = options.confidenceFloor ?? CORRALIO_OVERTURE_PROVISIONAL_CONFIDENCE_FLOOR;
  if (place.existenceConfidence < floor) return reject("confidence_below_floor", intent);
  if (operatingStatus === "confirmed_closed") return reject("confirmed_closed", intent);
  const categories = placeCategories(place);
  if ([...EXCLUDED_PRIMARY_CATEGORIES].some((category) => categories.has(category))) {
    return reject("excluded_structured_category", intent);
  }
  const normalizedName = normalizeVenueComparable(place.name);
  if (CONTRADICTORY_NAME_PATTERNS.some((pattern) => pattern.test(normalizedName))) {
    return reject("contradictory_identity", intent);
  }
  if (!place.address?.trim() && place.existenceConfidence < 0.8) {
    return reject("insufficient_identity", intent);
  }
  if (intent === "brewery" && operatingStatus === "status_unknown" && place.existenceConfidence < 0.8) {
    return reject("brewery_existence_uncertain", intent);
  }
  return {
    accepted: true,
    poolCategory,
    intentCategory: intent,
    operatingStatus,
    reason: "accepted",
    ruleVersion: CORRALIO_OVERTURE_CANDIDATE_QUALITY_RULE_VERSION,
  };
}

export function normalizeOvertureProvenance(sources: readonly OvertureSource[]) {
  const normalized = sources.map((source) => {
    const dataset = source.dataset.trim().toLowerCase();
    if (!dataset || dataset === "foursquare") return null;
    const licenseId = LICENSE_BY_DATASET[dataset];
    if (!licenseId) return null;
    const declaredLicense = source.license?.trim() || null;
    if (declaredLicense && declaredLicense !== licenseId) return null;
    if (dataset === "overture-signals" && (
      source.property !== "/properties/operating_status"
      || declaredLicense !== "CDLA-Permissive-2.0"
    )) return null;
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

function aliasComparableName(value: string) {
  const removable = new Set(["coffee", "company", "restaurant", "cafe"]);
  return normalizeVenueComparable(value).split(" ").filter((token) => !removable.has(token)).join(" ");
}

function provenanceStrength(place: OverturePlace) {
  const sources = normalizeOvertureProvenance(place.sources) ?? [];
  return new Set(sources.filter((source) => source.dataset !== "overture" && source.dataset !== "overture-signals")
    .map((source) => source.dataset)).size;
}

function identityCompleteness(place: OverturePlace) {
  return Number(Boolean(place.address?.trim())) + Number(Boolean(place.locality?.trim()));
}

function preferredDuplicate(a: OverturePlace, b: OverturePlace) {
  const provenance = provenanceStrength(b) - provenanceStrength(a);
  if (provenance) return provenance;
  const status = Number(normalizeCandidateOperatingStatus(b.operatingStatus) === "confirmed_open")
    - Number(normalizeCandidateOperatingStatus(a.operatingStatus) === "confirmed_open");
  if (status) return status;
  const confidence = (b.existenceConfidence ?? 0) - (a.existenceConfidence ?? 0);
  if (confidence) return confidence;
  const completeness = identityCompleteness(b) - identityCompleteness(a);
  if (completeness) return completeness;
  return a.featureId.localeCompare(b.featureId);
}

function duplicateIdentity(a: OverturePlace, b: OverturePlace) {
  if (a.featureId === b.featureId) return true;
  if (!a.address?.trim() || !b.address?.trim()) return false;
  return normalizeVenueComparable(a.address) === normalizeVenueComparable(b.address)
    && aliasComparableName(a.name) === aliasComparableName(b.name)
    && distanceMeters(a, b) <= 150;
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
  const byCategory = new Map<OverturePoolCategory, Array<{
    place: OverturePlace;
    distanceMeters: number;
    intentCategory: OvertureIntentCategory;
    operatingStatus: CorralioCandidateOperatingStatus;
  }>>([
    ["food", []],
    ["coffee", []],
  ]);
  for (const place of places) {
    const decision = evaluateOvertureCandidate(place, { confidenceFloor: floor });
    if (!decision.accepted || !decision.poolCategory || !decision.intentCategory) continue;
    if (!finiteCoordinate(place.latitude, -90, 90) || !finiteCoordinate(place.longitude, -180, 180)) continue;
    const distance = distanceMeters(venue, place);
    if (distance > radius) continue;
    byCategory.get(decision.poolCategory)!.push({
      place,
      distanceMeters: distance,
      intentCategory: decision.intentCategory,
      operatingStatus: decision.operatingStatus,
    });
  }
  const output: Array<{
    category: OverturePoolCategory;
    place: OverturePlace;
    distanceMeters: number;
    intentCategory: OvertureIntentCategory;
    operatingStatus: CorralioCandidateOperatingStatus;
  }> = [];
  for (const [category, rows] of byCategory) {
    const deduped: typeof rows = [];
    for (const row of rows) {
      const duplicateIndex = deduped.findIndex((current) => duplicateIdentity(current.place, row.place));
      if (duplicateIndex < 0) deduped.push(row);
      else if (preferredDuplicate(deduped[duplicateIndex].place, row.place) > 0) deduped[duplicateIndex] = row;
    }
    const sorted = deduped.sort((a, b) => a.distanceMeters - b.distanceMeters
      || (b.place.existenceConfidence ?? 0) - (a.place.existenceConfidence ?? 0)
      || a.place.featureId.localeCompare(b.place.featureId));
    if (category === "coffee") {
      output.push(...sorted.slice(0, cap).map((row) => ({ category, ...row })));
      continue;
    }

    const selected: typeof rows = [];
    const add = (row: (typeof rows)[number]) => {
      if (selected.length < cap && !selected.some((candidate) => candidate.place.featureId === row.place.featureId)) {
        selected.push(row);
      }
    };
    for (const intent of ["quick_service", "pizza", "sandwiches"] as const) {
      sorted.filter((row) => row.intentCategory === intent)
        .slice(0, CORRALIO_OVERTURE_FOOD_DIVERSITY.quickIntentAnchorEach).forEach(add);
    }
    sorted.filter((row) => row.intentCategory === "other_food")
      .slice(0, CORRALIO_OVERTURE_FOOD_DIVERSITY.otherFoodReserve).forEach(add);
    sorted.filter((row) => row.intentCategory === "brewery")
      .slice(0, CORRALIO_OVERTURE_FOOD_DIVERSITY.breweryReserve).forEach(add);
    [...sorted]
      .sort((a, b) => Number(!["quick_service", "pizza", "sandwiches"].includes(a.intentCategory))
        - Number(!["quick_service", "pizza", "sandwiches"].includes(b.intentCategory))
        || a.distanceMeters - b.distanceMeters
        || (b.place.existenceConfidence ?? 0) - (a.place.existenceConfidence ?? 0)
        || a.place.featureId.localeCompare(b.place.featureId))
      .forEach(add);
    output.push(...selected.map((row) => ({ category, ...row })));
  }
  return output;
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
