/**
 * Shared page-scanning utilities for fetching and extracting structured data
 * from tournament web pages (sport detection, location extraction).
 */

export type LocationResult = {
  city: string | null;
  state: string | null;
  zip: string | null;
};

// Valid US state abbreviations used to validate regex matches.
const VALID_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV",
  "WI","WY","DC",
]);

/**
 * Matches "Kansas City, MO 64101" / "Chicago IL" / "St. Louis, MO"
 * Each city word must start with an uppercase letter (title-case guard to
 * avoid matching mid-sentence words). Requires a valid two-letter state code.
 * Zip (5-digit, optional hyphen+4) is captured when present.
 */
const CITY_STATE_ZIP_RE =
  /([A-Z][a-z]*\.?(?:\s[A-Z][a-z]*\.?){0,3}),?\s+([A-Z]{2})\b(?:[,\s]+(\d{5}(?:-\d{4})?))?/g;

/** Last-resort zip-only fallback. */
const ZIP_ONLY_RE = /\b(\d{5})(?:-\d{4})?\b/g;

/**
 * Fetch the text content of a URL, stripping HTML tags and script/style blocks.
 * Returns null on any network error or non-200 response.
 */
export async function fetchPageText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    let resp: Response;
    try {
      resp = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "TournamentInsights-Bot/1.0" },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!resp.ok) return null;
    const html = await resp.text();
    const text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80_000);
    return text || null;
  } catch {
    return null;
  }
}

/**
 * Extract city, state, and zip from page text.
 * Uses a title-case city pattern + valid state code guard.
 * Falls back to zip-only when no full city/state match is found.
 */
export function extractLocationFromPageText(text: string): LocationResult {
  CITY_STATE_ZIP_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CITY_STATE_ZIP_RE.exec(text)) !== null) {
    const city = match[1].trim();
    const state = match[2];
    const zip = match[3] ?? null;

    // Reject if city is too short, contains digits, or state is not a US abbreviation
    if (city.length < 2 || /\d/.test(city)) continue;
    if (!VALID_STATES.has(state)) continue;

    return { city, state, zip };
  }

  // Zip-only fallback
  ZIP_ONLY_RE.lastIndex = 0;
  const zipMatch = ZIP_ONLY_RE.exec(text);
  return { city: null, state: null, zip: zipMatch ? zipMatch[1] : null };
}
