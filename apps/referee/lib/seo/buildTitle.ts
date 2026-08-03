const BRAND = "RefereeInsights";

function dedupeBrand(title: string) {
  return title.replace(/\s*\|\s*(TournamentInsights|RefereeInsights)/gi, "").trim();
}

function withBrand(main: string) {
  const clean = dedupeBrand(main);
  return `${clean} | ${BRAND}`;
}

export function buildHubTitle(stateName: string, sportLabel: string, year: number) {
  return withBrand(`${stateName} ${sportLabel} Tournament Guide (${year})`);
}

export function buildTournamentTitle(name: string, city: string | null, state: string | null, sportLabel: string) {
  const loc = [city, state].filter(Boolean).join(", ");
  const locPart = loc ? `${loc} ` : "";
  return withBrand(`${name} | ${locPart}${sportLabel} Event Guide`);
}

export function buildVenueTitle(name: string, city: string | null, state: string | null) {
  const loc = [city, state].filter(Boolean).join(", ");
  return withBrand(`${name} | ${loc} Venue Guide`);
}
