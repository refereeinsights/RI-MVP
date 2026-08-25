import { createHash } from "node:crypto";

import { normalizeVenueComparable } from "./venueMatching";

export const CORRALIO_PROVISIONAL_NORMALIZER_VERSION = "corralio-provisional-v1";

const STATE_NAMES = new Map<string, string>([
  ["alabama", "AL"], ["alaska", "AK"], ["arizona", "AZ"], ["arkansas", "AR"],
  ["california", "CA"], ["colorado", "CO"], ["connecticut", "CT"], ["delaware", "DE"],
  ["district of columbia", "DC"], ["florida", "FL"], ["georgia", "GA"], ["hawaii", "HI"],
  ["idaho", "ID"], ["illinois", "IL"], ["indiana", "IN"], ["iowa", "IA"], ["kansas", "KS"],
  ["kentucky", "KY"], ["louisiana", "LA"], ["maine", "ME"], ["maryland", "MD"],
  ["massachusetts", "MA"], ["michigan", "MI"], ["minnesota", "MN"], ["mississippi", "MS"],
  ["missouri", "MO"], ["montana", "MT"], ["nebraska", "NE"], ["nevada", "NV"],
  ["new hampshire", "NH"], ["new jersey", "NJ"], ["new mexico", "NM"], ["new york", "NY"],
  ["north carolina", "NC"], ["north dakota", "ND"], ["ohio", "OH"], ["oklahoma", "OK"],
  ["oregon", "OR"], ["pennsylvania", "PA"], ["rhode island", "RI"], ["south carolina", "SC"],
  ["south dakota", "SD"], ["tennessee", "TN"], ["texas", "TX"], ["utah", "UT"],
  ["vermont", "VT"], ["virginia", "VA"], ["washington", "WA"], ["west virginia", "WV"],
  ["wisconsin", "WI"], ["wyoming", "WY"],
]);

const NON_PLACE = /^(?:home|away|tbd|unknown|n\/?a|none|meet at hotel|school pickup|home field|away gym)$/i;
const LOGISTICS = /\b(?:pickup|drop[- ]?off|parking(?:\s+lot)?|meet\s+at|entrance|gate\s+\d+|check[- ]?in)\b/i;
const ORPHAN_SUBLOCATION = /^(?:field|court|diamond|rink|gym|room|mat|pool|track|pitch)\s*[a-z0-9-]*$/i;
const SUBLOCATION_SUFFIX = /(?:\s*[,|/–-]\s*|\s+)(?:field|fld|court|gym|diamond|rink|room|mat|pool|track|pitch)\s*[a-z0-9-]+\s*$/i;
const STREET_ONLY = /\b(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|court|ct|circle|cir|highway|hwy|parkway|pkwy|place|pl|terrace|ter)\.?$/i;

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeState(value: string) {
  const compacted = compact(value.replace(/[^a-z\s]/gi, " ")).toLowerCase();
  if (/^[a-z]{2}$/.test(compacted)) return compacted.toUpperCase();
  return STATE_NAMES.get(compacted) ?? null;
}

function stripCountryZipAndSubLocation(value: string) {
  let current = compact(value)
    .replace(/(?:,?\s*)(?:united states|usa|u\.?s\.?a?\.?)\s*$/i, "")
    .replace(/(?:,?\s*)\d{5}(?:-\d{4})?\s*$/i, "");
  while (SUBLOCATION_SUFFIX.test(current)) current = compact(current.replace(SUBLOCATION_SUFFIX, ""));
  return current;
}

export type ProvisionalPlaceIdentity = {
  placeName: string;
  normalizedPlaceName: string;
  normalizedAddress: string | null;
  city: string;
  state: string;
  identityKey: string;
  normalizerVersion: string;
};

export function parseProvisionalPlaceIdentity(value: string | null | undefined): ProvisionalPlaceIdentity | null {
  const stripped = stripCountryZipAndSubLocation(String(value ?? ""));
  if (!stripped || NON_PLACE.test(stripped) || LOGISTICS.test(stripped) || ORPHAN_SUBLOCATION.test(stripped)) return null;

  const parts = stripped.split(",").map(compact).filter(Boolean);
  if (parts.length < 3) return null;
  const state = normalizeState(parts.at(-1) ?? "");
  const city = parts.at(-2) ?? "";
  if (!state || !city) return null;

  const identityParts = parts.slice(0, -2);
  let placeName = identityParts[0] ?? "";
  let address: string | null = identityParts.length > 1 ? identityParts.slice(1).join(", ") : null;

  if (NON_PLACE.test(placeName) || ORPHAN_SUBLOCATION.test(placeName) || /^\d{1,6}\s+\S/.test(placeName) || STREET_ONLY.test(placeName)) return null;
  if (address && !/^\d{1,6}\s+\S/.test(address)) {
    // Multiple non-address fragments are commonly instructions or sub-locations.
    // Keep only an explicitly recognizable street-address component in shared data.
    address = null;
  }

  placeName = compact(placeName).slice(0, 160);
  const normalizedPlaceName = normalizeVenueComparable(placeName).slice(0, 200);
  const normalizedAddress = address ? normalizeVenueComparable(address).slice(0, 240) : null;
  const normalizedCity = normalizeVenueComparable(city).slice(0, 100);
  if (normalizedPlaceName.length < 2 || !normalizedCity) return null;

  const material = [
    CORRALIO_PROVISIONAL_NORMALIZER_VERSION,
    normalizedPlaceName,
    normalizedAddress ?? "",
    normalizedCity,
    state,
  ].join("\0");
  return {
    placeName,
    normalizedPlaceName,
    normalizedAddress,
    city: normalizedCity,
    state,
    identityKey: createHash("sha256").update(material).digest("hex"),
    normalizerVersion: CORRALIO_PROVISIONAL_NORMALIZER_VERSION,
  };
}
