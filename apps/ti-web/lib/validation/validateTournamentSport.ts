export type TournamentForValidation = {
  sport?: string | null;
  name?: string | null;
  official_website_url?: string | null;
};

export type SportValidationResult = "valid" | "mismatched" | "unknown";

const CONFLICT_KEYWORDS = [
  "basketball",
  "baseball",
  "softball",
  "fastpitch",
  "hockey",
  "lacrosse",
  "volleyball",
  "football",
  "wrestling",
];

export function validateTournamentSport(
  tournament: TournamentForValidation,
  requestedSport: string
): SportValidationResult {
  const requested = requestedSport.trim().toLowerCase();
  const sportField = (tournament.sport ?? "").trim().toLowerCase();
  const haystack = `${tournament.name ?? ""} ${(tournament.official_website_url ?? "")}`.toLowerCase();

  if (sportField && sportField !== requested) {
    return "mismatched";
  }

  for (const keyword of CONFLICT_KEYWORDS) {
    if (keyword === requested) continue;
    if (haystack.includes(keyword)) {
      return "mismatched";
    }
  }

  if (sportField === requested) return "valid";
  if (haystack.includes(requested)) return "valid";

  return "unknown";
}
