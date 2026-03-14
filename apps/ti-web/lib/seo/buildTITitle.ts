const BRAND = "TournamentInsights";

function ensureSingleBrand(title: string): string {
  const stripped = title.replace(new RegExp(`\\s*\\|\\s*${BRAND}$`), "");
  return `${stripped} | ${BRAND}`.replace(/\s+/g, " ").trim();
}

export function buildTIHubTitle(state: string, sport: string, year: number): string {
  const base = `${state} Youth ${sport} Tournaments (${year})`;
  return ensureSingleBrand(base);
}

export function buildTITournamentTitle(name: string, city?: string | null, state?: string | null, sport?: string | null): string {
  const location = [city, state].filter(Boolean).join(", ");
  const sportLabel = sport ? `${sport} Tournament` : "Tournament";
  const base = location ? `${name} | ${location} ${sportLabel}` : `${name} | ${sportLabel}`;
  return ensureSingleBrand(base);
}

export function buildTIVenueTitle(name: string, city?: string | null, state?: string | null): string {
  const location = [city, state].filter(Boolean).join(", ");
  const base = location ? `${name} | ${location} Youth Sports Venue` : `${name} | Youth Sports Venue`;
  return ensureSingleBrand(base);
}

export function assertNoDoubleBrand(title: string) {
  if (title.includes(`${BRAND} | ${BRAND}`)) {
    throw new Error("TI title contains duplicate brand suffix");
  }
}
