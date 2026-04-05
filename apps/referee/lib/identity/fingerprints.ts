function collapseSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeIdentityText(value: string | null | undefined) {
  return collapseSpaces(String(value ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " "));
}

export function normalizeIdentityStreet(value: string | null | undefined) {
  return collapseSpaces(
    String(value ?? "")
      .toLowerCase()
      .replace(/#\s*[a-z0-9-]+\b/g, " ")
      .replace(/\b(apt|apartment|suite|ste|unit|fl|floor)\s*[a-z0-9-]+\b/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+#\s*[a-z0-9-]+\b/g, " ")
      .replace(/\b(street|st)\b/g, "st")
      .replace(/\b(avenue|ave)\b/g, "ave")
      .replace(/\b(road|rd)\b/g, "rd")
      .replace(/\b(boulevard|blvd)\b/g, "blvd")
      .replace(/\b(drive|dr)\b/g, "dr")
      .replace(/\b(lane|ln)\b/g, "ln")
      .replace(/\b(court|ct)\b/g, "ct")
      .replace(/\b(place|pl)\b/g, "pl")
      .replace(/\b(parkway|pkwy)\b/g, "pkwy")
  );
}

export function normalizeIdentityUrlHost(value: string | null | undefined) {
  const input = String(value ?? "").trim();
  if (!input) return "";
  try {
    const parsed = new URL(input.startsWith("http") ? input : `https://${input}`);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return input
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/?#]/)[0]
      .trim();
  }
}

export function buildVenueAddressFingerprint(args: {
  address?: string | null;
  address1?: string | null;
  normalizedAddress?: string | null;
  city?: string | null;
  state?: string | null;
}) {
  const street = normalizeIdentityStreet(args.address1 ?? args.address ?? args.normalizedAddress ?? "");
  const city = normalizeIdentityText(args.city);
  const state = normalizeIdentityText(args.state);
  if (!street || !city || !state) return "";
  return `${street}|${city}|${state}`;
}

export function buildVenueNameCityStateFingerprint(args: {
  name?: string | null;
  city?: string | null;
  state?: string | null;
}) {
  const name = normalizeIdentityText(args.name);
  const city = normalizeIdentityText(args.city);
  const state = normalizeIdentityText(args.state);
  if (!name || !city || !state) return "";
  return `${name}|${city}|${state}`;
}

export function buildTournamentUrlFingerprint(url: string | null | undefined) {
  const input = String(url ?? "").trim();
  if (!input) return "";
  try {
    const normalized = new URL(input.startsWith("http") ? input : `https://${input}`);
    const host = normalized.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = normalized.pathname.replace(/\/+$/, "");
    return `${host}${pathname}` || host;
  } catch {
    return input
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[?#]/)[0]
      .replace(/\/$/, "");
  }
}

export function buildTournamentNameUrlFingerprint(args: {
  name?: string | null;
  officialWebsiteUrl?: string | null;
  sourceUrl?: string | null;
}) {
  const name = normalizeIdentityText(args.name);
  const url = buildTournamentUrlFingerprint(args.officialWebsiteUrl ?? args.sourceUrl ?? "");
  if (!name || !url) return "";
  return `${name}|${url}`;
}

export function buildTournamentNameStateSeasonFingerprint(args: {
  name?: string | null;
  state?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const name = normalizeIdentityText(args.name);
  const state = normalizeIdentityText(args.state);
  const primaryDate = String(args.startDate ?? args.endDate ?? "").trim();
  const season = primaryDate ? primaryDate.slice(0, 4) : "";
  if (!name || !state || !season) return "";
  return `${name}|${state}|${season}`;
}

// US state names keyed by two-letter abbreviation, used for prefix stripping.
const STATE_FULL_NAMES: Partial<Record<string, string>> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas",
  CA: "california", CO: "colorado", CT: "connecticut", DE: "delaware",
  FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho",
  IL: "illinois", IN: "indiana", IA: "iowa", KS: "kansas",
  KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland",
  MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi",
  MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada",
  NH: "new hampshire", NJ: "new jersey", NM: "new mexico", NY: "new york",
  NC: "north carolina", ND: "north dakota", OH: "ohio", OK: "oklahoma",
  OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina",
  SD: "south dakota", TN: "tennessee", TX: "texas", UT: "utah",
  VT: "vermont", VA: "virginia", WA: "washington", WV: "west virginia",
  WI: "wisconsin", WY: "wyoming", DC: "district of columbia",
};

/**
 * Strips 4-digit year tokens (1900–2099) from an already-normalized tournament name.
 * e.g. "spring showcase 2026" → "spring showcase"
 *      "2026 spring showcase" → "spring showcase"
 */
export function stripYearFromNormalizedName(name: string): string {
  return collapseSpaces(name.replace(/\b(?:19|20)\d{2}\b/g, " "));
}

/**
 * Strips a leading state name or two-letter abbreviation from a normalized
 * tournament name, using the tournament's known state field.
 * e.g. "california state cup" (state=CA) → "state cup"
 *      "wa state cup"         (state=WA) → "state cup"
 */
export function stripStatePrefixFromNormalizedName(
  normalizedName: string,
  state: string | null | undefined,
): string {
  if (!normalizedName || !state) return normalizedName;
  const abbr = state.trim().toUpperCase();
  const fullName = STATE_FULL_NAMES[abbr];
  if (fullName && normalizedName.startsWith(`${fullName} `)) {
    return collapseSpaces(normalizedName.slice(fullName.length));
  }
  const lowerAbbr = abbr.toLowerCase();
  if (normalizedName.startsWith(`${lowerAbbr} `)) {
    return collapseSpaces(normalizedName.slice(lowerAbbr.length));
  }
  return normalizedName;
}

/**
 * Fuzzy name+state+season fingerprint that strips year tokens and leading
 * state names/abbreviations before hashing. Catches variants like:
 *   "Spring Showcase" vs "Spring Showcase 2026"
 *   "California State Cup" vs "State Cup" (same state)
 *   "WA State Cup" vs "State Cup" (same state)
 */
export function buildTournamentFuzzyNameStateSeasonFingerprint(args: {
  name?: string | null;
  state?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}): string {
  const rawNorm = normalizeIdentityText(args.name);
  const withoutYear = stripYearFromNormalizedName(rawNorm);
  const strippedName = stripStatePrefixFromNormalizedName(withoutYear, args.state);
  const state = normalizeIdentityText(args.state);
  const primaryDate = String(args.startDate ?? args.endDate ?? "").trim();
  const season = primaryDate ? primaryDate.slice(0, 4) : "";
  if (!strippedName || !state || !season) return "";
  return `${strippedName}|${state}|${season}`;
}
