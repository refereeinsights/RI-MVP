export const CORRALIO_SPORTS = [
  "baseball",
  "softball",
  "soccer",
  "basketball",
  "volleyball",
  "hockey",
  "lacrosse",
  "football",
  "other",
] as const;

export type CorralioSport = (typeof CORRALIO_SPORTS)[number];

const SPORT_LABELS: Record<CorralioSport, string> = {
  baseball: "Baseball",
  softball: "Softball",
  soccer: "Soccer",
  basketball: "Basketball",
  volleyball: "Volleyball",
  hockey: "Hockey",
  lacrosse: "Lacrosse",
  football: "Football",
  other: "Other",
};

const SPORT_ICONS: Record<CorralioSport, string> = {
  baseball: "⚾",
  softball: "🥎",
  soccer: "⚽",
  basketball: "🏀",
  volleyball: "🏐",
  hockey: "🏒",
  lacrosse: "🥍",
  football: "🏈",
  other: "🏅",
};

export function parseCorralioSport(value: unknown): CorralioSport | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return CORRALIO_SPORTS.includes(normalized as CorralioSport)
    ? (normalized as CorralioSport)
    : null;
}

export function corralioSportLabel(sport: CorralioSport) {
  return SPORT_LABELS[sport];
}

export function corralioSportIcon(sport: CorralioSport) {
  return SPORT_ICONS[sport];
}
