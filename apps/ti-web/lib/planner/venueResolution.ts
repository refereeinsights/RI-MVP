type VenueLike = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  seo_slug?: string | null;
};

export type PlannerVenueMatchTarget = {
  id: string;
  address_text: string | null;
  city: string | null;
  state: string | null;
};

const US_STATE_ALIASES = new Map<string, string>([
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

const FIELD_ONLY_PATTERNS = [
  /^(field|fld)\s*[a-z0-9-]+$/i,
  /^(gym|court|diamond|rink|room|mat|pool|track|pitch)\s*[a-z0-9-]+$/i,
];

const DIRECTIONAL_ALIASES = new Map<string, string>([
  ["n", "north"], ["s", "south"], ["e", "east"], ["w", "west"],
  ["ne", "northeast"], ["nw", "northwest"], ["se", "southeast"], ["sw", "southwest"],
]);

const ADDRESS_ALIASES = new Map<string, string>([
  ["st", "street"], ["street", "street"], ["rd", "road"], ["road", "road"], ["ave", "avenue"], ["av", "avenue"], ["avenue", "avenue"],
  ["blvd", "boulevard"], ["boulevard", "boulevard"], ["dr", "drive"], ["drive", "drive"], ["ln", "lane"], ["lane", "lane"],
  ["ct", "court"], ["court", "court"], ["cir", "circle"], ["circle", "circle"], ["hwy", "highway"], ["highway", "highway"],
  ["pkwy", "parkway"], ["parkway", "parkway"], ["pl", "place"], ["place", "place"], ["ter", "terrace"], ["terrace", "terrace"],
  ["mt", "mount"], ["ft", "fort"], ["ste", "suite"], ["suite", "suite"],
]);

const COUNTRY_SUFFIX_PATTERN = /\b(?:united states|usa|u\.?s\.?a?\.?)$/i;

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeStateToken(value: string | null | undefined) {
  const raw = collapseWhitespace(String(value ?? "").toLowerCase().replace(/[^a-z\s]/g, " "));
  if (!raw) return null;
  return US_STATE_ALIASES.get(raw) ?? null;
}

function normalizeComparableText(value: string | null | undefined) {
  const raw = String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  const words = collapseWhitespace(raw)
    .split(" ")
    .filter(Boolean)
    .map((token) => DIRECTIONAL_ALIASES.get(token) ?? ADDRESS_ALIASES.get(token) ?? token);
  return words.join(" ").trim();
}

function isFieldOnlyLabel(value: string | null | undefined) {
  const raw = collapseWhitespace(String(value ?? ""));
  if (!raw) return false;
  return FIELD_ONLY_PATTERNS.some((pattern) => pattern.test(raw));
}

function stripTrailingSubLocation(value: string) {
  const trimmed = collapseWhitespace(value);
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+(?:\||\/|–|-)\s+/).map((part) => collapseWhitespace(part)).filter(Boolean);
  if (parts.length <= 1) return trimmed;
  const last = parts[parts.length - 1] ?? "";
  if (!isFieldOnlyLabel(last)) return trimmed;
  return parts.slice(0, -1).join(" · ");
}

function looksLikeStreetAddress(value: string | null | undefined) {
  return /\b\d{1,6}\s+[a-z0-9]/i.test(String(value ?? ""));
}

function stripCountrySuffix(value: string) {
  return collapseWhitespace(
    value
      .replace(/,\s*(?:united states|usa|u\.?s\.?a?\.?)$/i, "")
      .replace(COUNTRY_SUFFIX_PATTERN, ""),
  );
}

function stripTrailingAddressContext(value: string) {
  const trimmed = collapseWhitespace(value);
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+(?:\||\/|–|-)\s+/).map((part) => collapseWhitespace(part)).filter(Boolean);
  if (parts.length <= 1) return trimmed;

  for (let index = 1; index < parts.length; index += 1) {
    const left = parts.slice(0, index).join(", ");
    if (!looksLikeStreetAddress(left)) continue;
    const parsed = parseCityStateFromAddressText(left);
    if (parsed.city && parsed.state) {
      return left;
    }
  }

  return trimmed;
}

function parseCityStateFromAddressText(addressText: string) {
  const withoutCountry = stripCountrySuffix(stripTrailingAddressContext(addressText));

  const combinedCityStateMatch = withoutCountry.match(/^(.*)(?:\s+|,\s*)([A-Za-z][A-Za-z\s.'-]+?),\s*([A-Za-z]{2})$/);
  if (combinedCityStateMatch) {
    const normalizedState = normalizeStateToken(combinedCityStateMatch[3]);
    if (normalizedState) {
      return {
        city: collapseWhitespace(combinedCityStateMatch[2] ?? "") || null,
        state: normalizedState,
        baseText: collapseWhitespace(combinedCityStateMatch[1] ?? "") || withoutCountry,
      };
    }
  }

  const compactCityStateMatch = withoutCountry.match(/^(.*)(?:\s+|,\s*)([A-Za-z][A-Za-z\s.'-]+?)\s+([A-Za-z]{2})$/);
  if (compactCityStateMatch) {
    const normalizedState = normalizeStateToken(compactCityStateMatch[3]);
    if (normalizedState) {
      return {
        city: collapseWhitespace(compactCityStateMatch[2] ?? "") || null,
        state: normalizedState,
        baseText: collapseWhitespace(compactCityStateMatch[1] ?? "") || withoutCountry,
      };
    }
  }

  const segments = withoutCountry.split(",").map((segment) => collapseWhitespace(segment)).filter(Boolean);
  if (segments.length < 2) return { city: null as string | null, state: null as string | null, baseText: withoutCountry };

  const last = segments[segments.length - 1] ?? "";
  const prev = segments[segments.length - 2] ?? "";
  const normalizedState = normalizeStateToken(last);
  if (normalizedState) {
    return {
      city: prev || null,
      state: normalizedState,
      baseText: segments.slice(0, -2).join(", ") || segments[0] || withoutCountry,
    };
  }

  const combinedMatch = last.match(/^(.*?)(?:\s+|,\s*)([A-Za-z]{2}|[A-Za-z][A-Za-z\s]+)$/);
  const combinedState = combinedMatch ? normalizeStateToken(combinedMatch[2]) : null;
  if (combinedState) {
    return {
      city: collapseWhitespace(combinedMatch?.[1] ?? "") || prev || null,
      state: combinedState,
      baseText: segments.slice(0, -1).join(", ") || withoutCountry,
    };
  }

  return { city: null, state: null, baseText: withoutCountry };
}

type ParsedLocationContext = {
  rawLocation: string;
  baseText: string;
  cityText: string | null;
  stateText: string | null;
  normalizedBase: string;
  normalizedNameCandidate: string;
  normalizedCity: string | null;
  normalizedState: string | null;
  hasStreetAddress: boolean;
  mapEligible: boolean;
};

function inferVenueNameCandidate(baseText: string) {
  const withoutCountry = stripCountrySuffix(baseText);
  if (!withoutCountry) return "";

  const combinedCityStateMatch = withoutCountry.match(/^(.*)(?:\s+|,\s*)([A-Za-z][A-Za-z\s.'-]+?),\s*([A-Za-z]{2})$/);
  if (combinedCityStateMatch) return collapseWhitespace(combinedCityStateMatch[1] ?? "");

  const compactCityStateMatch = withoutCountry.match(/^(.*)(?:\s+|,\s*)([A-Za-z][A-Za-z\s.'-]+?)\s+([A-Za-z]{2})$/);
  if (compactCityStateMatch) return collapseWhitespace(compactCityStateMatch[1] ?? "");

  return withoutCountry;
}

function parseLocationContext(params: { address_text: string | null; city: string | null; state: string | null }): ParsedLocationContext | null {
  const addressText = collapseWhitespace(String(params.address_text ?? ""));
  const explicitCity = collapseWhitespace(String(params.city ?? ""));
  const explicitState = normalizeStateToken(params.state);
  const parsed = addressText ? parseCityStateFromAddressText(addressText) : { city: null, state: null, baseText: "" };
  const city = explicitCity || parsed.city || "";
  const state = explicitState || parsed.state || null;
  const baseText = stripTrailingSubLocation(collapseWhitespace(parsed.baseText || addressText));
  const hasStreetAddress = looksLikeStreetAddress(baseText) || looksLikeStreetAddress(addressText);
  const rawLocation = addressText || [city, state].map((value) => collapseWhitespace(String(value ?? ""))).filter(Boolean).join(", ");

  if (!rawLocation) return null;

  const normalizedCity = city ? normalizeComparableText(city) : null;
  const normalizedState = state ? normalizeStateToken(state) : null;
  const normalizedBase = normalizeComparableText(baseText);
  const normalizedNameCandidate = normalizeComparableText(inferVenueNameCandidate(baseText));
  const mapEligible = hasStreetAddress || (!!normalizedCity && !!normalizedState && !!normalizedBase && !isFieldOnlyLabel(baseText));

  return {
    rawLocation,
    baseText,
    cityText: city || null,
    stateText: state || null,
    normalizedBase,
    normalizedNameCandidate,
    normalizedCity,
    normalizedState,
    hasStreetAddress,
    mapEligible,
  };
}

function normalizeVenueCandidate(venue: VenueLike) {
  return {
    ...venue,
    normalizedName: normalizeComparableText(venue.name),
    normalizedAddress: normalizeComparableText(venue.address),
    normalizedCity: normalizeComparableText(venue.city),
    normalizedState: normalizeStateToken(venue.state),
  };
}

type NormalizedVenueCandidate = ReturnType<typeof normalizeVenueCandidate>;

export function mapsSearchUrl(query: string) {
  const value = collapseWhitespace(String(query ?? ""));
  if (!value) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
}

export function isMapLinkEligibleLocation(query: string | null | undefined) {
  const context = parseLocationContext({ address_text: String(query ?? ""), city: null, state: null });
  return Boolean(context?.mapEligible);
}

export function plannerEventLocationForMaps(event: {
  linkedVenue?: { name: string | null; address: string | null; city: string | null; state: string | null } | null;
  address_text: string | null;
  city: string | null;
  state: string | null;
}) {
  const linkedVenue = event.linkedVenue ?? null;
  const linkedVenueLocation = [linkedVenue?.name, linkedVenue?.address, linkedVenue?.city, linkedVenue?.state]
    .map((value) => collapseWhitespace(String(value ?? "")))
    .filter(Boolean)
    .join(", ");
  if (linkedVenueLocation) return linkedVenueLocation;

  const context = parseLocationContext({
    address_text: event.address_text,
    city: event.city,
    state: event.state,
  });
  return context?.mapEligible ? context.rawLocation : null;
}

export async function resolvePlannerVenueMatches(
  supabase: any,
  events: readonly PlannerVenueMatchTarget[],
): Promise<Map<string, string>> {
  const contexts = events
    .map((event) => ({ event, context: parseLocationContext(event) }))
    .filter((row): row is { event: PlannerVenueMatchTarget; context: ParsedLocationContext } => Boolean(row.context));

  if (!contexts.length) return new Map<string, string>();

  const cityStateContexts = contexts.filter((row) => Boolean(row.context.normalizedCity && row.context.normalizedState && row.context.normalizedBase));

  const groupKeyToEvents = new Map<string, Array<{ event: PlannerVenueMatchTarget; context: ParsedLocationContext }>>();
  for (const row of cityStateContexts) {
    const key = `${row.context.normalizedState}|${row.context.normalizedCity}`;
    const bucket = groupKeyToEvents.get(key) ?? [];
    bucket.push(row);
    groupKeyToEvents.set(key, bucket);
  }

  const groupEntries = Array.from(groupKeyToEvents.entries());
  const groupCandidates = await Promise.all(
    groupEntries.map(async ([key, grouped]) => {
      const first = grouped[0];
      const state = first?.context.normalizedState;
      const city = first?.context.normalizedCity;
      const rawCity = first?.context.cityText ? String(first.context.cityText).trim() : "";
      if (!state || !city || !rawCity) return [key, [] as NormalizedVenueCandidate[]] as const;

      const { data, error } = await (supabase.from("venues_public" as any) as any)
        .select("id,name,address,city,state")
        .eq("state", state)
        .ilike("city", rawCity)
        .limit(250);

      if (error) return [key, [] as NormalizedVenueCandidate[]] as const;

      const normalized = ((data ?? []) as any[])
        .map((venue: any) => normalizeVenueCandidate({
          id: String(venue?.id ?? ""),
          name: venue?.name ?? null,
          address: venue?.address ?? null,
          city: venue?.city ?? null,
          state: venue?.state ?? null,
          seo_slug: null,
        }))
        .filter((venue: NormalizedVenueCandidate) => venue.id && venue.normalizedCity === city && venue.normalizedState === state);

      return [key, normalized] as const;
    }),
  );

  const candidatesByGroup = new Map(groupCandidates);
  const matches = new Map<string, string>();

  for (const [key, grouped] of groupEntries) {
    const candidates = candidatesByGroup.get(key) ?? [];
    if (!candidates.length) continue;

    for (const row of grouped) {
      const exactAddressMatches = row.context.hasStreetAddress
        ? candidates.filter((candidate) => candidate.normalizedAddress && candidate.normalizedAddress === row.context.normalizedBase)
        : [];

      if (exactAddressMatches.length === 1) {
        matches.set(row.event.id, exactAddressMatches[0]!.id);
        continue;
      }
      if (exactAddressMatches.length > 1) continue;

      if (row.context.hasStreetAddress) continue;

      const exactNameMatches = candidates.filter(
        (candidate) =>
          candidate.normalizedName &&
          (candidate.normalizedName === row.context.normalizedBase || candidate.normalizedName === row.context.normalizedNameCandidate),
      );
      if (exactNameMatches.length === 1) {
        matches.set(row.event.id, exactNameMatches[0]!.id);
      }
    }
  }

  const unresolvedGlobalNameRows = contexts.filter(
    (row) => !matches.has(row.event.id) && !row.context.hasStreetAddress && row.context.normalizedNameCandidate,
  );

  if (unresolvedGlobalNameRows.length) {
    const { data, error } = await (supabase.from("venues_public" as any) as any)
      .select("id,name,address,city,state")
      .limit(5000);

    if (!error) {
      const globalCandidates = ((data ?? []) as any[])
        .map((venue: any) =>
          normalizeVenueCandidate({
            id: String(venue?.id ?? ""),
            name: venue?.name ?? null,
            address: venue?.address ?? null,
            city: venue?.city ?? null,
            state: venue?.state ?? null,
            seo_slug: null,
          }),
        )
        .filter((venue: NormalizedVenueCandidate) => venue.id && venue.normalizedName);

      for (const row of unresolvedGlobalNameRows) {
        const exactNameMatches = globalCandidates.filter(
          (candidate) => candidate.normalizedName && candidate.normalizedName === row.context.normalizedNameCandidate,
        );
        if (exactNameMatches.length === 1) {
          matches.set(row.event.id, exactNameMatches[0]!.id);
        }
      }
    }
  }

  return matches;
}
