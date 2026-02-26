export function getSportCardClass(sport: string | null) {
  const normalized = (sport ?? "").toLowerCase();
  const map: Record<string, string> = {
    soccer: "bg-sport-soccer",
    lacrosse: "bg-sport-lacrosse",
    volleyball: "bg-sport-volleyball",
    basketball: "bg-sport-basketball",
    football: "bg-sport-football",
    baseball: "bg-sport-baseball",
    softball: "bg-sport-softball",
    hockey: "bg-sport-hockey",
  };
  return map[normalized] ?? "bg-sport-default";
}

export function getSummarySportClass(sport: string) {
  return `summary-sport-${sport.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export function getVenueCardClassFromSports(sports: string[]) {
  const priority = ["lacrosse", "soccer", "basketball", "baseball", "softball", "football", "hockey", "volleyball"];
  const chosen = priority.find((sport) => sports.includes(sport)) ?? sports[0] ?? null;
  return getSportCardClass(chosen);
}
