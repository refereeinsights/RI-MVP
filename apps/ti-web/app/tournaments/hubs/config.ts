export const HUBS = {
  soccer: { sport: "soccer", title: "Youth Soccer Tournaments" },
  baseball: { sport: "baseball", title: "Youth Baseball Tournaments" },
  lacrosse: { sport: "lacrosse", title: "Youth Lacrosse Tournaments" },
  basketball: { sport: "basketball", title: "Youth Basketball Tournaments" },
  hockey: { sport: "hockey", title: "Youth Hockey Tournaments" },
  ayso: { sport: "soccer", isAyso: true, title: "AYSO Soccer Tournaments" },
} as const;

export type HubKey = keyof typeof HUBS;

export const HUB_ORDER: HubKey[] = ["soccer", "baseball", "lacrosse", "basketball", "hockey", "ayso"];

export const SPORTS_LABELS: Record<string, string> = {
  soccer: "Soccer",
  basketball: "Basketball",
  football: "Football",
  baseball: "Baseball",
  softball: "Softball",
  volleyball: "Volleyball",
  lacrosse: "Lacrosse",
  wrestling: "Wrestling",
  hockey: "Hockey",
  unknown: "Unknown",
};
