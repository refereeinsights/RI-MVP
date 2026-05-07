export type VenueMatchInput = {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
};

const ADDRESS_EXPANSIONS: [RegExp, string][] = [
  [/\bst\b/g, "street"],
  [/\bave\b/g, "avenue"],
  [/\bblvd\b/g, "boulevard"],
  [/\bdr\b/g, "drive"],
  [/\brd\b/g, "road"],
  [/\bln\b/g, "lane"],
  [/\bct\b/g, "court"],
  [/\bpkwy\b/g, "parkway"],
  [/\bhwy\b/g, "highway"],
];

const NAME_EXPANSIONS: [RegExp, string][] = [
  [/\bhs\b/g, "high school"],
  [/\belem\b/g, "elementary"],
  [/\bms\b/g, "middle school"],
  [/\bjr\b/g, "junior"],
  [/\bsr\b/g, "senior"],
];

// Longest-first so "sports complex" is stripped before "complex"
const NOISE_PATTERN =
  /\s+(sports complex|athletic complex|athletic center|sports center|soccer complex|soccer park|stadium|complex|arena|center|fields|field|park)$/;

export function normalizeAddress(value: string | null): string | null {
  if (!value) return null;
  let v = value.toLowerCase().trim();
  for (const [pattern, replacement] of ADDRESS_EXPANSIONS) {
    v = v.replace(pattern, replacement);
  }
  v = v.replace(/\s+/g, " ").trim();
  return v || null;
}

export function normalizeName(value: string | null): string | null {
  if (!value) return null;
  let v = value.toLowerCase().trim();
  for (const [pattern, replacement] of NAME_EXPANSIONS) {
    v = v.replace(pattern, replacement);
  }
  // Strip trailing noise words; loop until stable
  let prev = "";
  while (prev !== v) {
    prev = v;
    v = v.replace(NOISE_PATTERN, "").trim();
  }
  return v || null;
}

function sameCity(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase().trim() === b.toLowerCase().trim();
}

function sameState(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.toUpperCase().trim() === b.toUpperCase().trim();
}

/**
 * Finds the best venue match from pre-fetched candidates.
 * Tier 1: address-based (both sides must have address).
 * Tier 2: normalized name + city + state.
 * Returns the matching candidate (which retains its `id` at runtime) or null.
 */
export function findVenueMatch(
  candidates: VenueMatchInput[],
  incoming: VenueMatchInput
): VenueMatchInput | null {
  // Tier 1 — address match
  if (incoming.address) {
    const normAddr = normalizeAddress(incoming.address);
    if (normAddr) {
      for (const c of candidates) {
        if (!c.address) continue;
        if (
          normalizeAddress(c.address) === normAddr &&
          sameCity(c.city, incoming.city) &&
          sameState(c.state, incoming.state)
        ) {
          return c;
        }
      }
    }
  }

  // Tier 2 — normalized name match
  const normName = normalizeName(incoming.name);
  if (normName) {
    for (const c of candidates) {
      if (
        normalizeName(c.name) === normName &&
        sameCity(c.city, incoming.city) &&
        sameState(c.state, incoming.state)
      ) {
        return c;
      }
    }
  }

  return null;
}
