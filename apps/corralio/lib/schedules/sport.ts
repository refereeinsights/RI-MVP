export const CORRALIO_SPORTS = [
  "baseball",
  "softball",
  "soccer",
  "basketball",
  "volleyball",
  "hockey",
  "lacrosse",
  "football",
  "tennis",
  "swimming",
  "gymnastics",
  "track_field",
  "golf",
  "wrestling",
  "cheer",
  "dance",
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
  tennis: "Tennis",
  swimming: "Swimming",
  gymnastics: "Gymnastics",
  track_field: "Track & Field",
  golf: "Golf",
  wrestling: "Wrestling",
  cheer: "Cheer",
  dance: "Dance",
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
  tennis: "🎾",
  swimming: "🏊",
  gymnastics: "🤸",
  track_field: "🏃",
  golf: "⛳",
  wrestling: "🤼",
  cheer: "📣",
  dance: "💃",
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
