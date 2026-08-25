import { createHash } from "node:crypto";

export const CORRALIO_VENUE_MATCHER_VERSION = "corralio-v1";
export const CORRALIO_UNMATCHED_RECHECK_DAYS = 30;

export type VenueMatchStatus = "matched" | "provisional" | "unmatched" | "private_skipped" | "insufficient_location";

export type VenueMatchEvent = {
  id: string;
  sourceLocationText: string | null;
  displayLocationText: string | null;
};

export type ExistingVenueMatch = {
  eventId: string;
  venueId: string | null;
  provisionalVenueId: string | null;
  matchStatus: VenueMatchStatus;
  locationFingerprint: string;
  matcherVersion: string;
  recheckAfter: string | null;
};

export type VenueCandidate = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
};

export type VenueMatchResult = {
  eventId: string;
  venueId: string | null;
  provisionalVenueId: string | null;
  matchStatus: VenueMatchStatus;
  locationFingerprint: string;
  matcherVersion: string;
  evaluatedAt: string;
  matchedAt: string | null;
  recheckAfter: string | null;
};

export type VenueMatchStats = {
  eventsProcessed: number;
  uniqueNormalizedLocations: number;
  venueCandidateQueries: number;
  reusedCandidateGroups: number;
};

type LocationContext = {
  normalizedInput: string;
  normalizedBase: string;
  normalizedName: string;
  normalizedCity: string;
  state: string;
  rawCity: string;
  hasStreetAddress: boolean;
};

type MatchDependencies = {
  listCandidates(city: string, state: string): Promise<{ candidates: VenueCandidate[]; queryCount: number }>;
  currentVenueIds(venueIds: readonly string[]): Promise<Set<string>>;
  currentProvisionalVenueIds(provisionalVenueIds: readonly string[]): Promise<Set<string>>;
};

const STATE_ALIASES = new Map<string, string>([
  ["al", "AL"], ["alabama", "AL"], ["ak", "AK"], ["alaska", "AK"], ["az", "AZ"], ["arizona", "AZ"],
  ["ar", "AR"], ["arkansas", "AR"], ["ca", "CA"], ["california", "CA"], ["co", "CO"], ["colorado", "CO"],
  ["ct", "CT"], ["connecticut", "CT"], ["de", "DE"], ["delaware", "DE"], ["dc", "DC"], ["district of columbia", "DC"],
  ["fl", "FL"], ["florida", "FL"], ["ga", "GA"], ["georgia", "GA"], ["hi", "HI"], ["hawaii", "HI"],
  ["id", "ID"], ["idaho", "ID"], ["il", "IL"], ["illinois", "IL"], ["in", "IN"], ["indiana", "IN"],
  ["ia", "IA"], ["iowa", "IA"], ["ks", "KS"], ["kansas", "KS"], ["ky", "KY"], ["kentucky", "KY"],
  ["la", "LA"], ["louisiana", "LA"], ["me", "ME"], ["maine", "ME"], ["md", "MD"], ["maryland", "MD"],
  ["ma", "MA"], ["massachusetts", "MA"], ["mi", "MI"], ["michigan", "MI"], ["mn", "MN"], ["minnesota", "MN"],
  ["ms", "MS"], ["mississippi", "MS"], ["mo", "MO"], ["missouri", "MO"], ["mt", "MT"], ["montana", "MT"],
  ["ne", "NE"], ["nebraska", "NE"], ["nv", "NV"], ["nevada", "NV"], ["nh", "NH"], ["new hampshire", "NH"],
  ["nj", "NJ"], ["new jersey", "NJ"], ["nm", "NM"], ["new mexico", "NM"], ["ny", "NY"], ["new york", "NY"],
  ["nc", "NC"], ["north carolina", "NC"], ["nd", "ND"], ["north dakota", "ND"], ["oh", "OH"], ["ohio", "OH"],
  ["ok", "OK"], ["oklahoma", "OK"], ["or", "OR"], ["oregon", "OR"], ["pa", "PA"], ["pennsylvania", "PA"],
  ["ri", "RI"], ["rhode island", "RI"], ["sc", "SC"], ["south carolina", "SC"], ["sd", "SD"], ["south dakota", "SD"],
  ["tn", "TN"], ["tennessee", "TN"], ["tx", "TX"], ["texas", "TX"], ["ut", "UT"], ["utah", "UT"],
  ["vt", "VT"], ["vermont", "VT"], ["va", "VA"], ["virginia", "VA"], ["wa", "WA"], ["washington", "WA"],
  ["wv", "WV"], ["west virginia", "WV"], ["wi", "WI"], ["wisconsin", "WI"], ["wy", "WY"], ["wyoming", "WY"],
]);

const TOKEN_ALIASES = new Map<string, string>([
  ["n", "north"], ["s", "south"], ["e", "east"], ["w", "west"],
  ["ne", "northeast"], ["nw", "northwest"], ["se", "southeast"], ["sw", "southwest"],
  ["st", "street"], ["rd", "road"], ["ave", "avenue"], ["av", "avenue"], ["blvd", "boulevard"],
  ["dr", "drive"], ["ln", "lane"], ["ct", "court"], ["cir", "circle"], ["hwy", "highway"],
  ["pkwy", "parkway"], ["pl", "place"], ["ter", "terrace"], ["mt", "mount"], ["ft", "fort"],
  ["apt", "unit"], ["apartment", "unit"], ["suite", "unit"], ["ste", "unit"],
]);

const SUB_LOCATION_SUFFIX = /(?:\s*[,|/–-]\s*|\s+)(?:apartment|apt|suite|ste|unit|field|fld|court|gym|diamond|rink|room|mat|pool|track|pitch|#)\s*[a-z0-9-]+\s*$/i;
const COUNTRY_SUFFIX = /(?:,?\s*)(?:united states|usa|u\.?s\.?a?\.?)\s*$/i;

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeState(value: string | null | undefined) {
  const normalized = collapseWhitespace(String(value ?? "").toLowerCase().replace(/[^a-z\s]/g, " "));
  return STATE_ALIASES.get(normalized) ?? null;
}

export function normalizeVenueComparable(value: string | null | undefined) {
  const words = String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => TOKEN_ALIASES.get(token) ?? token);
  return words.join(" ");
}

function removeCountryAndZip(value: string) {
  return collapseWhitespace(value.replace(COUNTRY_SUFFIX, "").replace(/(?:,?\s*)\d{5}(?:-\d{4})?\s*$/i, ""));
}

function removeSubLocation(value: string) {
  let current = collapseWhitespace(value);
  while (SUB_LOCATION_SUFFIX.test(current)) current = collapseWhitespace(current.replace(SUB_LOCATION_SUFFIX, ""));
  return current;
}

export function normalizePrivacyAddress(value: string | null | undefined) {
  const complete = normalizeVenueComparable(removeCountryAndZip(collapseWhitespace(String(value ?? ""))));
  const base = normalizeVenueComparable(removeSubLocation(removeCountryAndZip(collapseWhitespace(String(value ?? "")))));
  return complete ? { complete, base } : null;
}

export function isHouseholdOriginLocation(location: string | null, originAddress: string | null) {
  const locationNormalized = normalizePrivacyAddress(location);
  const originNormalized = normalizePrivacyAddress(originAddress);
  if (!locationNormalized || !originNormalized) return false;
  return locationNormalized.complete === originNormalized.complete || locationNormalized.base === originNormalized.base;
}

export function eventLocationText(event: VenueMatchEvent) {
  return collapseWhitespace(event.sourceLocationText ?? "") || collapseWhitespace(event.displayLocationText ?? "") || null;
}

export function venueLocationFingerprint(householdId: string, normalizedInput: string) {
  return createHash("sha256").update(householdId).update("\0").update(normalizedInput).digest("hex");
}

function parseLocation(value: string): LocationContext | null {
  const withoutSubLocation = removeCountryAndZip(removeSubLocation(value));
  const combinedCityState = withoutSubLocation.match(/^(.*)\s+([a-z][a-z .'-]+),\s*([a-z]{2})$/i);
  const commaParts = withoutSubLocation.split(",").map(collapseWhitespace).filter(Boolean);
  let state: string | null = null;
  let rawCity = "";
  let base = "";

  if (combinedCityState) {
    state = normalizeState(combinedCityState[3]);
    rawCity = collapseWhitespace(combinedCityState[2] ?? "");
    base = collapseWhitespace(combinedCityState[1] ?? "");
  } else if (commaParts.length >= 3) {
    state = normalizeState(commaParts[commaParts.length - 1]);
    rawCity = commaParts[commaParts.length - 2] ?? "";
    base = commaParts.slice(0, -2).join(", ");
  } else if (commaParts.length === 2) {
    const last = commaParts[1] ?? "";
    const cityState = last.match(/^(.*?)\s+([a-z]{2}|[a-z][a-z\s]+)$/i);
    state = cityState ? normalizeState(cityState[2]) : normalizeState(last);
    rawCity = cityState ? collapseWhitespace(cityState[1] ?? "") : "";
    base = commaParts[0] ?? "";
  } else {
    const compact = withoutSubLocation.match(/^(.*?)(?:\s+)([a-z][a-z .'-]+?)\s+([a-z]{2})$/i);
    if (compact) {
      state = normalizeState(compact[3]);
      rawCity = collapseWhitespace(compact[2] ?? "");
      base = collapseWhitespace(compact[1] ?? "");
    }
  }

  const normalizedInput = normalizeVenueComparable(value);
  const normalizedBase = normalizeVenueComparable(base);
  const normalizedCity = normalizeVenueComparable(rawCity);
  const hasStreetAddress = /\b\d{1,6}\s+[a-z0-9]/i.test(base);
  if (!normalizedInput || !state || !normalizedCity || !normalizedBase) return null;

  return {
    normalizedInput,
    normalizedBase,
    normalizedName: normalizedBase,
    normalizedCity,
    state,
    rawCity,
    hasStreetAddress,
  };
}

function normalizeCandidate(candidate: VenueCandidate) {
  return {
    ...candidate,
    normalizedName: normalizeVenueComparable(candidate.name),
    normalizedAddress: normalizeVenueComparable(candidate.address),
    normalizedCity: normalizeVenueComparable(candidate.city),
    normalizedState: normalizeState(candidate.state),
  };
}

function safeAddressMatch(eventAddress: string, candidateAddress: string) {
  const strong = /\b\d{1,6}\s+[a-z0-9]/.test(candidateAddress) && candidateAddress.split(" ").length >= 3 && candidateAddress.length >= 10;
  return strong && (candidateAddress === eventAddress || eventAddress.includes(candidateAddress));
}

function matchOne(context: LocationContext, candidates: readonly VenueCandidate[]) {
  const normalized = candidates
    .map(normalizeCandidate)
    .filter((candidate) => candidate.id && candidate.normalizedCity === context.normalizedCity && candidate.normalizedState === context.state);

  if (context.hasStreetAddress) {
    const addressMatches = normalized.filter((candidate) => safeAddressMatch(context.normalizedBase, candidate.normalizedAddress));
    return addressMatches.length === 1 ? addressMatches[0]!.id : null;
  }

  const nameMatches = normalized.filter((candidate) => candidate.normalizedName === context.normalizedName);
  return nameMatches.length === 1 ? nameMatches[0]!.id : null;
}

type LocationClassification =
  | { status: "private_skipped" | "insufficient_location"; context: null }
  | { status: "public"; context: LocationContext };

function isReusable(existing: ExistingVenueMatch | undefined, fingerprint: string, classification: LocationClassification, now: Date, forceRematch: boolean, currentVenueIds: Set<string>) {
  if (!existing || forceRematch || existing.locationFingerprint !== fingerprint || existing.matcherVersion !== CORRALIO_VENUE_MATCHER_VERSION) return false;
  if (classification.status !== "public") return existing.matchStatus === classification.status;
  if (existing.matchStatus === "private_skipped" || existing.matchStatus === "insufficient_location") return false;
  if (existing.matchStatus === "matched" && (!existing.venueId || !currentVenueIds.has(existing.venueId))) return false;
  if (existing.matchStatus === "provisional") return Boolean(existing.provisionalVenueId && existing.recheckAfter && Date.parse(existing.recheckAfter) > now.getTime());
  if (existing.matchStatus === "unmatched") return Boolean(existing.recheckAfter && Date.parse(existing.recheckAfter) > now.getTime());
  return true;
}

export async function evaluateVenueMatches(input: {
  householdId: string;
  originAddress: string | null;
  events: readonly VenueMatchEvent[];
  existing: readonly ExistingVenueMatch[];
  now?: Date;
  forceRematch?: boolean;
}, dependencies: MatchDependencies): Promise<{ results: VenueMatchResult[]; stats: VenueMatchStats }> {
  const now = input.now ?? new Date();
  const evaluatedAt = now.toISOString();
  const existingByEvent = new Map(input.existing.map((row) => [row.eventId, row]));
  const prepared = input.events.map((event) => {
    const location = eventLocationText(event);
    const normalizedInput = normalizeVenueComparable(location);
    const fingerprint = venueLocationFingerprint(input.householdId, normalizedInput);
    let classification: LocationClassification;
    if (!location || !normalizedInput) {
      classification = { status: "insufficient_location", context: null };
    } else if (isHouseholdOriginLocation(location, input.originAddress)) {
      classification = { status: "private_skipped", context: null };
    } else {
      const context = parseLocation(location);
      classification = context
        ? { status: "public", context }
        : { status: "insufficient_location", context: null };
    }
    return { event, normalizedInput, fingerprint, classification };
  });
  const preparedByEvent = new Map(prepared.map((row) => [row.event.id, row]));
  const matchedVenueIds = input.existing.flatMap((row) => {
    const preparedRow = preparedByEvent.get(row.eventId);
    return preparedRow?.classification.status === "public" && row.matchStatus === "matched" && row.venueId ? [row.venueId] : [];
  });
  const provisionalVenueIds = input.existing.flatMap((row) => row.matchStatus === "provisional" && row.provisionalVenueId ? [row.provisionalVenueId] : []);
  const [currentVenueIds, currentProvisionalVenueIds] = await Promise.all([
    matchedVenueIds.length ? dependencies.currentVenueIds([...new Set(matchedVenueIds)]) : new Set<string>(),
    provisionalVenueIds.length ? dependencies.currentProvisionalVenueIds([...new Set(provisionalVenueIds)]) : new Set<string>(),
  ]);
  const pending = prepared.filter((row) => {
    const existing = existingByEvent.get(row.event.id);
    if (existing?.matchStatus === "provisional" && existing.provisionalVenueId && !currentProvisionalVenueIds.has(existing.provisionalVenueId)) return true;
    return !isReusable(existing, row.fingerprint, row.classification, now, input.forceRematch === true, currentVenueIds);
  });
  const results: VenueMatchResult[] = [];
  const publicRows: Array<typeof pending[number] & { context: LocationContext }> = [];

  for (const row of pending) {
    if (row.classification.status !== "public") {
      results.push({ eventId: row.event.id, venueId: null, provisionalVenueId: null, matchStatus: row.classification.status, locationFingerprint: row.fingerprint, matcherVersion: CORRALIO_VENUE_MATCHER_VERSION, evaluatedAt, matchedAt: null, recheckAfter: null });
      continue;
    }
    publicRows.push({ ...row, context: row.classification.context });
  }

  const groups = new Map<string, typeof publicRows>();
  for (const row of publicRows) {
    const key = `${row.context.state}|${row.context.normalizedCity}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  let venueCandidateQueries = 0;
  for (const rows of groups.values()) {
    const first = rows[0]!;
    const candidateScope = await dependencies.listCandidates(first.context.rawCity, first.context.state);
    venueCandidateQueries += candidateScope.queryCount;
    for (const row of rows) {
      const venueId = matchOne(row.context, candidateScope.candidates);
      const matched = Boolean(venueId);
      results.push({
        eventId: row.event.id,
        venueId,
        provisionalVenueId: null,
        matchStatus: matched ? "matched" : "unmatched",
        locationFingerprint: row.fingerprint,
        matcherVersion: CORRALIO_VENUE_MATCHER_VERSION,
        evaluatedAt,
        matchedAt: matched ? evaluatedAt : null,
        recheckAfter: matched ? null : new Date(now.getTime() + CORRALIO_UNMATCHED_RECHECK_DAYS * 86_400_000).toISOString(),
      });
    }
  }

  return {
    results,
    stats: {
      eventsProcessed: input.events.length,
      uniqueNormalizedLocations: new Set(prepared.map((row) => row.normalizedInput).filter(Boolean)).size,
      venueCandidateQueries,
      reusedCandidateGroups: Math.max(0, publicRows.length - groups.size),
    },
  };
}
