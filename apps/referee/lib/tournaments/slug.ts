/**
 * Remove tournament year references from names
 * Examples:
 *  - "Spring Cup 2025" → "Spring Cup"
 *  - "Fall Classic (2026)" → "Fall Classic"
 *  - "State Finals 2025–26" → "State Finals"
 *  - "Summer Kickoff '25" → "Summer Kickoff"
 */
function stripYears(input: string): string {
  return input
    // 4-digit years and ranges (2025, 2025-26, 2025–2026, 2025/26)
    .replace(/\b(19|20)\d{2}(\s*[-–/]\s*((19|20)\d{2}|\d{2}))?\b/g, "")
    // apostrophe years: '25 or ’25
    .replace(/[’']\d{2}\b/g, "")
    // cleanup empty parentheses
    .replace(/\(\s*\)/g, "")
    // normalize whitespace
    .replace(/\s{2,}/g, " ")
    .trim();
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildTournamentSlug(args: {
  name: string;
  city?: string | null;
  state?: string | null;
}): string {
  const cleanName = stripYears(args.name);

  const parts = [
    cleanName,
    args.city ?? null,
    args.state ?? null,
  ].filter(Boolean) as string[];

  return slugify(parts.join("-"));
}
