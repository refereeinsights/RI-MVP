export type SportValidation = "valid" | "mismatched" | "unknown";

const conflictingKeywords: Record<string, string[]> = {
  basketball: ["basketball", "hoops"],
  baseball: ["baseball"],
  softball: ["softball", "fastpitch"],
  hockey: ["hockey"],
  lacrosse: ["lacrosse"],
  volleyball: ["volleyball"],
  soccer: ["soccer", "futsal"], // futsal often treated separately but close
};

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

export function validateTournamentSport(t: { sport?: string | null; official_website_url?: string | null }): SportValidation {
  const sport = normalize(t.sport);
  if (!sport) return "unknown";

  const url = normalize(t.official_website_url);
  const keywords = conflictingKeywords[sport] ?? [];

  // If sport not recognized, treat as unknown
  if (!Object.keys(conflictingKeywords).includes(sport)) return "unknown";

  if (url) {
    // If URL contains keywords from a *different* sport, flag mismatch
    for (const [otherSport, words] of Object.entries(conflictingKeywords)) {
      if (otherSport === sport) continue;
      if (words.some((w) => url.includes(w))) {
        return "mismatched";
      }
    }
  }

  return "valid";
}
