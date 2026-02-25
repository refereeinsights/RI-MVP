type StateDef = {
  code: string;
  slug: string;
  name: string;
};

type SportDef = {
  key: string;
  slug: string;
  name: string;
  aliases?: string[];
};

const ALL_STATES: StateDef[] = [
  { code: "AL", slug: "alabama", name: "Alabama" },
  { code: "AK", slug: "alaska", name: "Alaska" },
  { code: "AZ", slug: "arizona", name: "Arizona" },
  { code: "AR", slug: "arkansas", name: "Arkansas" },
  { code: "CA", slug: "california", name: "California" },
  { code: "CO", slug: "colorado", name: "Colorado" },
  { code: "CT", slug: "connecticut", name: "Connecticut" },
  { code: "DE", slug: "delaware", name: "Delaware" },
  { code: "FL", slug: "florida", name: "Florida" },
  { code: "GA", slug: "georgia", name: "Georgia" },
  { code: "HI", slug: "hawaii", name: "Hawaii" },
  { code: "ID", slug: "idaho", name: "Idaho" },
  { code: "IL", slug: "illinois", name: "Illinois" },
  { code: "IN", slug: "indiana", name: "Indiana" },
  { code: "IA", slug: "iowa", name: "Iowa" },
  { code: "KS", slug: "kansas", name: "Kansas" },
  { code: "KY", slug: "kentucky", name: "Kentucky" },
  { code: "LA", slug: "louisiana", name: "Louisiana" },
  { code: "ME", slug: "maine", name: "Maine" },
  { code: "MD", slug: "maryland", name: "Maryland" },
  { code: "MA", slug: "massachusetts", name: "Massachusetts" },
  { code: "MI", slug: "michigan", name: "Michigan" },
  { code: "MN", slug: "minnesota", name: "Minnesota" },
  { code: "MS", slug: "mississippi", name: "Mississippi" },
  { code: "MO", slug: "missouri", name: "Missouri" },
  { code: "MT", slug: "montana", name: "Montana" },
  { code: "NE", slug: "nebraska", name: "Nebraska" },
  { code: "NV", slug: "nevada", name: "Nevada" },
  { code: "NH", slug: "new-hampshire", name: "New Hampshire" },
  { code: "NJ", slug: "new-jersey", name: "New Jersey" },
  { code: "NM", slug: "new-mexico", name: "New Mexico" },
  { code: "NY", slug: "new-york", name: "New York" },
  { code: "NC", slug: "north-carolina", name: "North Carolina" },
  { code: "ND", slug: "north-dakota", name: "North Dakota" },
  { code: "OH", slug: "ohio", name: "Ohio" },
  { code: "OK", slug: "oklahoma", name: "Oklahoma" },
  { code: "OR", slug: "oregon", name: "Oregon" },
  { code: "PA", slug: "pennsylvania", name: "Pennsylvania" },
  { code: "RI", slug: "rhode-island", name: "Rhode Island" },
  { code: "SC", slug: "south-carolina", name: "South Carolina" },
  { code: "SD", slug: "south-dakota", name: "South Dakota" },
  { code: "TN", slug: "tennessee", name: "Tennessee" },
  { code: "TX", slug: "texas", name: "Texas" },
  { code: "UT", slug: "utah", name: "Utah" },
  { code: "VT", slug: "vermont", name: "Vermont" },
  { code: "VA", slug: "virginia", name: "Virginia" },
  { code: "WA", slug: "washington", name: "Washington" },
  { code: "WV", slug: "west-virginia", name: "West Virginia" },
  { code: "WI", slug: "wisconsin", name: "Wisconsin" },
  { code: "WY", slug: "wyoming", name: "Wyoming" },
];

export const curatedStates: StateDef[] = [
  { code: "WA", slug: "washington", name: "Washington" },
  { code: "OR", slug: "oregon", name: "Oregon" },
  { code: "ID", slug: "idaho", name: "Idaho" },
  { code: "CA", slug: "california", name: "California" },
  { code: "UT", slug: "utah", name: "Utah" },
  { code: "NV", slug: "nevada", name: "Nevada" },
  { code: "AZ", slug: "arizona", name: "Arizona" },
  { code: "TX", slug: "texas", name: "Texas" },
  { code: "FL", slug: "florida", name: "Florida" },
  { code: "NY", slug: "new-york", name: "New York" },
];

export const curatedSports: SportDef[] = [
  { key: "soccer", slug: "soccer", name: "Soccer", aliases: ["futbol"] },
  { key: "baseball", slug: "baseball", name: "Baseball" },
  { key: "lacrosse", slug: "lacrosse", name: "Lacrosse", aliases: ["lax"] },
  { key: "basketball", slug: "basketball", name: "Basketball", aliases: ["hoops"] },
  { key: "hockey", slug: "hockey", name: "Hockey", aliases: ["ice-hockey"] },
  { key: "volleyball", slug: "volleyball", name: "Volleyball", aliases: ["vb"] },
  { key: "softball", slug: "softball", name: "Softball" },
  { key: "football", slug: "football", name: "Football" },
  { key: "futsal", slug: "futsal", name: "Futsal", aliases: ["indoor-soccer"] },
];

const STATE_BY_CODE = new Map(ALL_STATES.map((state) => [state.code, state]));
const STATE_BY_SLUG = new Map(ALL_STATES.map((state) => [state.slug, state]));

const SPORT_ALIAS_TO_KEY = new Map<string, string>(
  curatedSports.flatMap((sport) => [
    [sport.slug, sport.key],
    [sport.key, sport.key],
    ...((sport.aliases ?? []).map((alias) => [alias, sport.key] as const)),
  ]),
);

export function mapStateSlugToCode(slug: string): string | null {
  if (!slug) return null;
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.length === 2) {
    const code = normalized.toUpperCase();
    return STATE_BY_CODE.has(code) ? code : null;
  }
  return STATE_BY_SLUG.get(normalized)?.code ?? null;
}

export function mapStateCodeToName(code: string): string | null {
  if (!code) return null;
  return STATE_BY_CODE.get(code.trim().toUpperCase())?.name ?? null;
}

export function mapStateCodeToSlug(code: string): string | null {
  if (!code) return null;
  return STATE_BY_CODE.get(code.trim().toUpperCase())?.slug ?? null;
}

export function mapStateSlugToName(slug: string): string | null {
  const code = mapStateSlugToCode(slug);
  return code ? mapStateCodeToName(code) : null;
}

export function normalizeSportSlug(slug: string): string | null {
  if (!slug) return null;
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "ayso") return "soccer";
  return SPORT_ALIAS_TO_KEY.get(normalized) ?? null;
}

export function sportDisplayName(sportKey: string): string {
  const key = String(sportKey ?? "").trim().toLowerCase();
  const match = curatedSports.find((sport) => sport.key === key);
  return match?.name ?? key.charAt(0).toUpperCase() + key.slice(1);
}
