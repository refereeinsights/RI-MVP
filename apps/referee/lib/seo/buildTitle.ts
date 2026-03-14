const BRAND = "TournamentInsights";

function dedupeBrand(title: string) {
  return title.replace(/\s*\|\s*TournamentInsights/gi, "").trim();
}

function withBrand(main: string) {
  const clean = dedupeBrand(main);
  return `${clean} | ${BRAND}`;
}

export function buildHubTitle(stateName: string, sportLabel: string, year: number) {
  return withBrand(`${stateName} Youth ${sportLabel} Tournaments (${year})`);
}

export function buildTournamentTitle(name: string, city: string | null, state: string | null, sportLabel: string) {
  const loc = [city, state].filter(Boolean).join(", ");
  const locPart = loc ? `${loc} ` : "";
  return withBrand(`${name} | ${locPart}${sportLabel} Tournament`);
}

export function buildVenueTitle(name: string, city: string | null, state: string | null) {
  const loc = [city, state].filter(Boolean).join(", ");
  return withBrand(`${name} | ${loc} Youth Sports Venue`);
}
