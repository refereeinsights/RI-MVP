import { load as cheerioLoad } from "cheerio";
import { buildTournamentSlug } from "../tournaments/slug";
import { normalizeSourceUrl } from "../normalizeSourceUrl";
import { makeVenueSlug } from "@/lib/venues/slug";

type Sport = "baseball" | "softball" | "basketball";

export type TopTierCrawlerOptions = {
  writeDb?: boolean;
  maxPages?: number;
  sports?: Sport[];
};

type ParsedVenue = {
  name: string;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  venueUrl: string | null;
};

type ParsedEvent = {
  sourceUrl: string;
  sourceTitle: string;
  sport: Sport | "unknown";
  tournamentName: string;
  startDate: string | null;
  endDate: string | null;
  city: string | null;
  state: string | null;
  eventId: string | null;
  exposureDomain: string | null;
  exposureTitle: string | null;
  notes: string | null;
  confidence: number;
  venues: ParsedVenue[];
};

type ListingMeta = {
  startDate: string | null;
  endDate: string | null;
  city: string | null;
  state: string | null;
};

type CrawlSummary = {
  candidateUrls: number;
  parsedEvents: number;
  acceptedEvents: number;
  bySport: Record<string, number>;
  tournamentsUpserted: number;
  venuesCreated: number;
  venuesMatched: number;
  venueLinksCreated: number;
  sourcesUpserted: number;
};

const BASE_URL = "https://toptiersports.net";
const DEFAULT_MAX_PAGES = 250;
const DEFAULT_SPORTS: Sport[] = ["baseball", "softball", "basketball"];

const LISTING_SEEDS = [
  "https://toptiersports.net/eastern-washington-baseball-tournaments/",
  "https://toptiersports.net/western-washington-baseball-tournaments/",
  "https://toptiersports.net/softball-tournaments/",
  "https://toptiersports.net/basketball/",
  "https://toptiersports.net/page-sitemap.xml",
];

const EXCLUDE_PATH_PARTS = [
  "/about",
  "/contact",
  "/privacy",
  "/faqs",
  "/rankings",
  "/rules",
  "/league",
  "/home",
  "/tournaments/",
];

function cleanText(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function toAbs(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function normalizeKey(input: string | null | undefined): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isLikelyTournamentPath(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname !== "toptiersports.net") return false;
    const p = u.pathname.toLowerCase();
    if (p === "/" || p.length < 3) return false;
    if (EXCLUDE_PATH_PARTS.some((part) => p.includes(part))) return false;
    return /bullpen|classic|tournament|showdown|series|finale|invitational|meltdown|bash|slugfest|firecracker|dust-up|fiasco|mania|exclusive|wars|collide|basketball/.test(
      p
    );
  } catch {
    return false;
  }
}

function detectSport(text: string): Sport | "unknown" {
  const t = text.toLowerCase();
  if (/\bsoftball\b/.test(t)) return "softball";
  if (/\bbasketball\b/.test(t)) return "basketball";
  if (/\bbaseball\b|\bbullpen\b|hs:/.test(t)) return "baseball";
  return "unknown";
}

function parseDateRangeFromTitle(title: string): { startDate: string | null; endDate: string | null } {
  const monthMap: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };

  const m = title.match(/([A-Za-z]{3})\s+(\d{1,2})-(\d{1,2}),\s*(\d{4})/);
  if (!m) return { startDate: null, endDate: null };
  const month = monthMap[m[1].slice(0, 3).toLowerCase()];
  if (!month) return { startDate: null, endDate: null };
  const year = Number(m[4]);
  const day1 = Number(m[2]);
  const day2 = Number(m[3]);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    startDate: `${year}-${pad(month)}-${pad(day1)}`,
    endDate: `${year}-${pad(month)}-${pad(day2)}`,
  };
}

function parseCityStateFromTitle(title: string): { city: string | null; state: string | null } {
  const m = title.match(/-\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s*$/);
  if (!m) return { city: null, state: null };
  return { city: m[1].trim(), state: m[2].trim() };
}

function parseEventNameFromExposureTitle(title: string): string | null {
  const m = title.match(/^(.+?)\s*-\s*[A-Za-z]{3}\s+\d{1,2}-\d{1,2},\s*\d{4}/);
  return m ? m[1].trim() : null;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow" });
  return res.text();
}

async function collectCandidateUrls(maxPages: number): Promise<string[]> {
  const { urls } = await collectCandidateUrlsWithMeta(maxPages);
  return urls;
}

function parseMonthDayRange(text: string, defaultYear: number): { startDate: string | null; endDate: string | null } {
  const monthMap: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };
  const m = text.match(/([A-Za-z]{3,9})\s*(\d{1,2})(?:st|nd|rd|th)?\s*[-–]\s*(\d{1,2})(?:st|nd|rd|th)?/i);
  if (!m) return { startDate: null, endDate: null };
  const month = monthMap[m[1].toLowerCase()] || monthMap[m[1].slice(0, 3).toLowerCase()];
  if (!month) return { startDate: null, endDate: null };
  const d1 = Number(m[2]);
  const d2 = Number(m[3]);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    startDate: `${defaultYear}-${pad(month)}-${pad(d1)}`,
    endDate: `${defaultYear}-${pad(month)}-${pad(d2)}`,
  };
}

function extractListingMetaForUrl(html: string, absoluteUrl: string): ListingMeta {
  const idx = html.indexOf(absoluteUrl);
  if (idx < 0) return { startDate: null, endDate: null, city: null, state: null };
  const snippet = cleanText(html.slice(Math.max(0, idx - 1000), idx + 250));
  const dates = parseMonthDayRange(snippet, 2026);
  const loc = snippet.match(/([A-Za-z .'-]+),\s*([A-Z]{2})\b/i);
  return {
    startDate: dates.startDate,
    endDate: dates.endDate,
    city: loc ? loc[1].trim() : null,
    state: loc ? loc[2].toUpperCase() : null,
  };
}

async function collectCandidateUrlsWithMeta(
  maxPages: number
): Promise<{ urls: string[]; listingMetaByUrl: Map<string, ListingMeta> }> {
  const out = new Set<string>();
  const listingMetaByUrl = new Map<string, ListingMeta>();
  for (const seed of LISTING_SEEDS) {
    try {
      const html = await fetchText(seed);
      if (seed.endsWith(".xml")) {
        for (const m of html.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
          const loc = m[1].trim();
          if (isLikelyTournamentPath(loc)) out.add(loc);
        }
        continue;
      }

      const $ = cheerioLoad(html);
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        const abs = toAbs(href, seed);
        if (isLikelyTournamentPath(abs)) {
          out.add(abs);
          if (!listingMetaByUrl.has(abs)) {
            listingMetaByUrl.set(abs, extractListingMetaForUrl(html, abs));
          }
        }
      });
    } catch {
      // ignore seed failures
    }
  }
  return { urls: [...out].slice(0, maxPages), listingMetaByUrl };
}

async function parseExposureEvent(domain: string, eventId: string): Promise<{
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  city: string | null;
  state: string | null;
  name: string | null;
}> {
  try {
    const eventUrl = `https://${domain}.exposureevents.com/widgets/v1/event?eventid=${eventId}&header=true&menu=true`;
    const html = await fetchText(eventUrl);
    const $ = cheerioLoad(html);
    const title = cleanText($("title").first().text() || "");
    const { startDate, endDate } = parseDateRangeFromTitle(title);
    const { city, state } = parseCityStateFromTitle(title);
    const name = parseEventNameFromExposureTitle(title);
    return { title: title || null, startDate, endDate, city, state, name };
  } catch {
    return { title: null, startDate: null, endDate: null, city: null, state: null, name: null };
  }
}

async function parseExposureVenues(domain: string, eventId: string): Promise<ParsedVenue[]> {
  try {
    const venuesUrl = `https://${domain}.exposureevents.com/widgets/v1/venues?eventid=${eventId}&header=true&menu=true`;
    const html = await fetchText(venuesUrl);
    const venues = [...html.matchAll(
      /<div><span class=\"org\">([\s\S]*?)<\/span>\s*(?:<span>\(([\s\S]*?)\)<\/span>)?<\/div>[\s\S]*?<div class=\"street-address\">([\s\S]*?)<\/div>[\s\S]*?<span class=\"locality\">([\s\S]*?)<\/span>,\s*<span class=\"region\">([\s\S]*?)<\/span>,\s*<span class=\"postal-code\">([\s\S]*?)<\/span>[\s\S]*?<a[^>]*href=\"([^\"]+)\"/gi
    )].map((m) => ({
      name: cleanText(m[1]),
      address1: cleanText(m[3]) || null,
      city: cleanText(m[4]) || null,
      state: cleanText(m[5]) || null,
      zip: cleanText(m[6]) || null,
      venueUrl: m[7] || null,
    }));
    return venues;
  } catch {
    return [];
  }
}

async function parseTournamentPage(url: string, listingMeta?: ListingMeta): Promise<ParsedEvent | null> {
  try {
    const html = await fetchText(url);
    const $ = cheerioLoad(html);
    const title = cleanText($("title").first().text() || "") || null;
    const metaDesc = cleanText($('meta[name="description"]').attr("content") || "") || null;
    const pageText = [title, metaDesc, url].filter(Boolean).join(" ");

    const exposureDomain =
      html.match(/https?:\/\/([a-z]+)\.exposureevents\.com\//i)?.[1]?.toLowerCase() ?? null;
    const eventId = html.match(/eventid=(\d{4,})/i)?.[1] ?? null;
    const exposure = exposureDomain && eventId ? await parseExposureEvent(exposureDomain, eventId) : null;
    const venues = exposureDomain && eventId ? await parseExposureVenues(exposureDomain, eventId) : [];

    const fallbackName =
      title?.replace(/\s*-\s*Top Tier Sports\s*$/i, "").trim() ||
      new URL(url).pathname.replace(/\//g, " ").trim();
    const tournamentName = exposure?.name || fallbackName;

    const sport = detectSport([pageText, exposure?.title, tournamentName, exposureDomain ?? ""].join(" "));
    const descDates = parseMonthDayRange([title, metaDesc].filter(Boolean).join(" "), 2026);
    const textBlob = [title, metaDesc].filter(Boolean).join(" ");
    const stateCityFromText = textBlob.match(/([A-Za-z .'-]+),\s*([A-Z]{2})\b/i) || [];
    const fallbackCity = stateCityFromText[1] ? stateCityFromText[1].trim() : null;
    const stateFromCityState = stateCityFromText[2] ? stateCityFromText[2].toUpperCase() : null;
    const stateFromKeyword = /\bwashington\b/i.test(textBlob)
      ? "WA"
      : /\bidaho\b/i.test(textBlob)
      ? "ID"
      : /\boregon\b/i.test(textBlob)
      ? "OR"
      : /\bcalifornia\b/i.test(textBlob)
      ? "CA"
      : null;
    const fallbackState = stateFromCityState || stateFromKeyword;

    const startDate = exposure?.startDate ?? listingMeta?.startDate ?? descDates.startDate ?? null;
    const endDate = exposure?.endDate ?? listingMeta?.endDate ?? descDates.endDate ?? null;
    const city = exposure?.city ?? listingMeta?.city ?? fallbackCity ?? null;
    const state = exposure?.state ?? listingMeta?.state ?? fallbackState ?? null;

    let confidence = 35;
    if (eventId && exposure?.title) confidence = 80;
    if (startDate && endDate) confidence += 10;
    if (city && state) confidence += 5;
    if (sport !== "unknown") confidence += 5;

    return {
      sourceUrl: url,
      sourceTitle: title || tournamentName,
      sport,
      tournamentName,
      startDate,
      endDate,
      city,
      state,
      eventId,
      exposureDomain,
      exposureTitle: exposure?.title ?? null,
      notes: metaDesc,
      confidence: Math.min(confidence, 99),
      venues,
    };
  } catch {
    return null;
  }
}

async function upsertVenueAndLink(
  supabaseAdmin: any,
  tournamentId: string,
  venue: ParsedVenue,
  counters: CrawlSummary
) {
  if (!venue.name || !venue.city || !venue.state) return;

  const lookup = await supabaseAdmin
    .from("venues")
    .select("id,name,address1,address,city,state,zip")
    .eq("city", venue.city)
    .eq("state", venue.state)
    .limit(300);
  const existingRows = lookup.data ?? [];
  const matched = existingRows.find(
    (row: any) =>
      normalizeKey(row.name) === normalizeKey(venue.name) &&
      normalizeKey(row.address1 || row.address) === normalizeKey(venue.address1) &&
      normalizeKey(row.zip) === normalizeKey(venue.zip)
  );

  let venueId = matched?.id as string | undefined;
  if (!venueId) {
    const insertPayload = {
      name: venue.name,
      address1: venue.address1,
      address: venue.address1,
      city: venue.city,
      state: venue.state,
      zip: venue.zip,
      venue_url: venue.venueUrl,
      seo_slug: makeVenueSlug(venue.name, venue.city, venue.state),
    };
    const inserted = await supabaseAdmin.from("venues").insert(insertPayload).select("id").single();
    if (!inserted.error && inserted.data?.id) {
      venueId = inserted.data.id;
      counters.venuesCreated += 1;
    } else {
      return;
    }
  } else {
    counters.venuesMatched += 1;
    if (venue.venueUrl) {
      await supabaseAdmin.from("venues").update({ venue_url: venue.venueUrl }).eq("id", venueId);
    }
  }

  const linkCheck = await supabaseAdmin
    .from("tournament_venues")
    .select("tournament_id,venue_id")
    .eq("tournament_id", tournamentId)
    .eq("venue_id", venueId)
    .limit(1);
  if ((linkCheck.data ?? []).length) return;
  const linkInsert = await supabaseAdmin
    .from("tournament_venues")
    .insert({ tournament_id: tournamentId, venue_id: venueId });
  if (!linkInsert.error) counters.venueLinksCreated += 1;
}

export async function runTopTierCrawler(options?: TopTierCrawlerOptions) {
  const writeDb = options?.writeDb === true;
  const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
  const sports = new Set(options?.sports ?? DEFAULT_SPORTS);

  const summary: CrawlSummary = {
    candidateUrls: 0,
    parsedEvents: 0,
    acceptedEvents: 0,
    bySport: {},
    tournamentsUpserted: 0,
    venuesCreated: 0,
    venuesMatched: 0,
    venueLinksCreated: 0,
    sourcesUpserted: 0,
  };

  const { urls: candidateUrls, listingMetaByUrl } = await collectCandidateUrlsWithMeta(maxPages);
  summary.candidateUrls = candidateUrls.length;

  const parsed: ParsedEvent[] = [];
  for (const url of candidateUrls) {
    const event = await parseTournamentPage(url, listingMetaByUrl.get(url));
    if (!event) continue;
    summary.parsedEvents += 1;
    if (event.sport === "unknown" || !sports.has(event.sport)) continue;
    parsed.push(event);
  }

  const deduped: ParsedEvent[] = Array.from(
    parsed.reduce((map, row) => {
      const key = row.sourceUrl;
      const existing = map.get(key);
      if (!existing || existing.confidence < row.confidence) map.set(key, row);
      return map;
    }, new Map<string, ParsedEvent>()).values()
  );

  for (const row of deduped) {
    summary.acceptedEvents += 1;
    summary.bySport[row.sport] = (summary.bySport[row.sport] || 0) + 1;
  }

  if (!writeDb) {
    return { summary, rows: deduped };
  }

  const { supabaseAdmin } = await import("../supabaseAdmin");
  for (const row of deduped) {
    if (!row.state || !row.startDate) continue;
    const slug = buildTournamentSlug({
      name: row.tournamentName,
      city: row.city ?? undefined,
      state: row.state ?? undefined,
    });
    const payload = {
      name: row.tournamentName,
      slug,
      sport: row.sport,
      city: row.city,
      state: row.state,
      start_date: row.startDate,
      end_date: row.endDate,
      source: "internet",
      source_domain: "toptiersports.net",
      source_url: row.sourceUrl,
      official_website_url: row.sourceUrl,
      tournament_association: "Top Tier Sports",
      status: "published",
      confidence: row.confidence,
      source_title: row.sourceTitle,
      tournament_director: "Dustin Minga",
      referee_contact: "Dustin.Minga@toptiersports.net | 253-682-9517",
    };
    const upserted = await supabaseAdmin
      .from("tournaments")
      .upsert(payload, { onConflict: "slug" })
      .select("id")
      .single();
    if (upserted.error || !upserted.data?.id) continue;
    summary.tournamentsUpserted += 1;
    const tournamentId = String(upserted.data.id);

    const normalized = normalizeSourceUrl(row.sourceUrl);
    const sourceInsert = await supabaseAdmin.from("tournament_sources").upsert(
      {
        tournament_id: tournamentId,
        url: normalized.canonical,
        source_url: normalized.canonical,
        normalized_url: normalized.normalized,
        domain: "toptiersports.net",
        title: row.sourceTitle,
        fetched_at: new Date().toISOString(),
        http_status: 200,
        extracted_json: {
          event_id: row.eventId,
          exposure_domain: row.exposureDomain,
          exposure_title: row.exposureTitle,
          venues_count: row.venues.length,
        },
        extract_confidence: row.confidence,
      },
      { onConflict: "normalized_url" }
    );
    if (!sourceInsert.error) summary.sourcesUpserted += 1;

    for (const venue of row.venues) {
      await upsertVenueAndLink(supabaseAdmin, tournamentId, venue, summary);
    }
  }

  return { summary, rows: deduped };
}
