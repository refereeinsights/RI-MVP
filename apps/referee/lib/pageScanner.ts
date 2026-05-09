/**
 * Shared page-scanning utilities for fetching and extracting structured data
 * from tournament web pages (sport detection, location extraction).
 */

export type LocationResult = {
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type VenueExtractCandidate = {
  venue_name: string | null;
  venue_address: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_zip: string | null;
  venue_url: string | null;
  confidence: "high" | "medium" | "low";
  evidence: string | null;
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

const STREET_RE =
  /\b(\d{1,7}\s+[A-Za-z0-9][A-Za-z0-9 .,'/#&()-]{2,80}?\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Cir|Circle|Pkwy|Parkway|Hwy|Highway|Pl|Place)\.?)\b/gi;

const ADDRESS_LINE_RE =
  /(\d{1,7}\s+[A-Za-z0-9][A-Za-z0-9 .,'/#&()-]{2,80}?\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Cir|Circle|Pkwy|Parkway|Hwy|Highway|Pl|Place)\.?),?\s+([A-Z][a-z]*\.?(?:\s[A-Z][a-z]*\.?){0,3}),?\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?/g;

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ");
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

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
 * Fetch raw HTML (bounded) for extraction helpers that need links/structure.
 * Returns null on any network error or non-200 response.
 */
export async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
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
    const html = (await resp.text()).slice(0, 250_000);
    return html || null;
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

function buildEvidenceSnippet(text: string, idx: number, len: number) {
  const start = Math.max(0, idx - 120);
  const end = Math.min(text.length, idx + len + 120);
  return normalizeWhitespace(text.slice(start, end)).slice(0, 260) || null;
}

function parseGoogleMapsQuery(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const q = u.searchParams.get("q") || u.searchParams.get("query") || u.searchParams.get("destination");
    return q ? decodeURIComponent(q) : null;
  } catch {
    return null;
  }
}

function toConfidence(hasStreet: boolean, hasCityState: boolean, hasZip: boolean): "high" | "medium" | "low" {
  if (hasStreet && hasCityState && hasZip) return "high";
  if (hasStreet && hasCityState) return "medium";
  return "low";
}

/**
 * Best-effort extraction of venue candidates from a tournament/source page.
 * Output is for manual review (no writes).
 */
export function extractVenueCandidatesFromHtml(html: string): VenueExtractCandidate[] {
  const cleanedHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");

  const candidates: VenueExtractCandidate[] = [];

  // 1) Harvest candidate addresses from Google Maps links.
  const mapHrefRe = /\bhref\s*=\s*["']([^"']+)["']/gi;
  let hrefMatch: RegExpExecArray | null;
  while ((hrefMatch = mapHrefRe.exec(cleanedHtml)) !== null) {
    const href = hrefMatch[1];
    if (!href) continue;
    const hrefLower = href.toLowerCase();
    if (
      !hrefLower.includes("google.com/maps") &&
      !hrefLower.includes("maps.google.com") &&
      !hrefLower.includes("goo.gl/maps")
    ) continue;

    const query = parseGoogleMapsQuery(href);
    if (!query) continue;

    // Try to parse a full address line from the query.
    const queryText = decodeHtmlEntities(query);
    const m = ADDRESS_LINE_RE.exec(queryText);
    ADDRESS_LINE_RE.lastIndex = 0;
    if (m) {
      const street = normalizeWhitespace(m[1]);
      const city = normalizeWhitespace(m[2]);
      const state = m[3].toUpperCase();
      const zip = m[4];
      if (VALID_STATES.has(state)) {
        candidates.push({
          venue_name: null,
          venue_address: street,
          venue_city: city,
          venue_state: state,
          venue_zip: zip,
          venue_url: href,
          confidence: "high",
          evidence: normalizeWhitespace(queryText).slice(0, 260) || null,
        });
      }
    }
  }

  // 2) Extract addresses from visible text.
  const text = decodeHtmlEntities(
    cleanedHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|h6)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim()
      .slice(0, 120_000)
  );

  ADDRESS_LINE_RE.lastIndex = 0;
  let m2: RegExpExecArray | null;
  while ((m2 = ADDRESS_LINE_RE.exec(text)) !== null) {
    const street = normalizeWhitespace(m2[1]);
    const city = normalizeWhitespace(m2[2]);
    const state = m2[3].toUpperCase();
    const zip = m2[4];
    if (!VALID_STATES.has(state)) continue;
    candidates.push({
      venue_name: null,
      venue_address: street,
      venue_city: city,
      venue_state: state,
      venue_zip: zip,
      venue_url: null,
      confidence: "high",
      evidence: buildEvidenceSnippet(text, m2.index, m2[0].length),
    });
  }

  // 3) If we found no full address lines, try street-only + city/state nearby.
  if (candidates.length === 0) {
    STREET_RE.lastIndex = 0;
    let sm: RegExpExecArray | null;
    while ((sm = STREET_RE.exec(text)) !== null) {
      const street = normalizeWhitespace(sm[1]);
      if (!street) continue;

      const snippet = buildEvidenceSnippet(text, sm.index, sm[0].length) ?? "";
      const loc = extractLocationFromPageText(snippet);
      const city = loc.city;
      const state = loc.state ? loc.state.toUpperCase() : null;
      const zip = loc.zip;
      const hasCityState = Boolean(city && state && VALID_STATES.has(state));
      candidates.push({
        venue_name: null,
        venue_address: street,
        venue_city: city,
        venue_state: state && VALID_STATES.has(state) ? state : null,
        venue_zip: zip,
        venue_url: null,
        confidence: toConfidence(true, hasCityState, Boolean(zip)),
        evidence: snippet || null,
      });
      if (candidates.length >= 10) break;
    }
  }

  // Dedup by (address, city, state, zip)
  const seen = new Set<string>();
  const out: VenueExtractCandidate[] = [];
  for (const c of candidates) {
    const key = [
      (c.venue_address ?? "").toLowerCase(),
      (c.venue_city ?? "").toLowerCase(),
      (c.venue_state ?? "").toLowerCase(),
      (c.venue_zip ?? "").toLowerCase(),
    ].join("|");
    if (!key.replace(/\|/g, "")) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }

  const rank = (c: VenueExtractCandidate) => (c.confidence === "high" ? 3 : c.confidence === "medium" ? 2 : 1);
  return out.sort((a, b) => rank(b) - rank(a)).slice(0, 10);
}
