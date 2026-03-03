export const TI_SPORTS = [
  "soccer",
  "basketball",
  "football",
  "baseball",
  "softball",
  "volleyball",
  "lacrosse",
  "wrestling",
  "hockey",
  "futsal",
] as const;

export type TiSport = (typeof TI_SPORTS)[number];

export const TI_SPORT_LABELS: Record<TiSport, string> = {
  soccer: "Soccer",
  basketball: "Basketball",
  football: "Football",
  baseball: "Baseball",
  softball: "Softball",
  volleyball: "Volleyball",
  lacrosse: "Lacrosse",
  wrestling: "Wrestling",
  hockey: "Hockey",
  futsal: "Futsal",
};
