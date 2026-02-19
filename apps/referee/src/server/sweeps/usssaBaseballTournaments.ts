import * as cheerio from "cheerio";
import { upsertTournamentFromSource } from "@/lib/tournaments/upsertFromSource";
import { buildTournamentSlug } from "@/lib/tournaments/slug";
import type { TournamentRow, TournamentStatus } from "@/lib/types/tournament";
import { queueEnrichmentJobs } from "@/server/enrichment/pipeline";
import { normalizeSourceUrl, upsertRegistry } from "@/server/admin/sources";

const USSSA_BASEBALL_EVENTS_URL = "https://usssa.com/baseball_events";
const STATE_HOST_RE = /^[a-z]{2}baseball\.usssa\.com$/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

type ParsedEvent = {
  name: string;
  url: string | null;
  state: string | null;
  city: string | null;
  level: string | null;
  dateText: string | null;
  feeText: string | null;
  sourcePageUrl: string;
};

export type UsssaBaseballSweepResult = {
  imported_ids: string[];
  counts: {
    states_found: number;
    state_pages_processed: number;
    found: number;
    imported: number;
  };
  sample: Array<{
    name: string;
    state: string | null;
    city: string | null;
    date: string | null;
    url: string | null;
  }>;
};

function stateCodeFromHost(host: string) {
  const match = host.toLowerCase().match(/^([a-z]{2})baseball\.usssa\.com$/);
  return match ? match[1].toUpperCase() : null;
}

function parseMonthIndex(token: string | null | undefined) {
  if (!token) return null;
  const idx = MONTHS.findIndex((m) => token.toLowerCase().startsWith(m));
  return idx >= 0 ? idx : null;
}

function parseDateRange(dateText: string | null): { start: string | null; end: string | null } {
  if (!dateText) return { start: null, end: null };
  const text = dateText.replace(/\s+/g, " ").trim();
  const fullRange = text.match(
    /([A-Za-z]{3,9})\s*(\d{1,2})\s*[-–]\s*(?:(\d{1,2})|([A-Za-z]{3,9})\s*(\d{1,2}))(?:,?\s*(20\d{2}))?/i
  );
  const single = text.match(/([A-Za-z]{3,9})\s*(\d{1,2})(?:,?\s*(20\d{2}))?/i);
  const now = new Date();

  if (fullRange) {
    const month1 = parseMonthIndex(fullRange[1]);
    const day1 = Number(fullRange[2]);
    const day2 = fullRange[3] ? Number(fullRange[3]) : Number(fullRange[5] || "");
    const month2 = fullRange[4] ? parseMonthIndex(fullRange[4]) : month1;
    const yearRaw = fullRange[6] ? Number(fullRange[6]) : now.getFullYear();
    if (month1 === null || month2 === null || !Number.isFinite(day1) || !Number.isFinite(day2)) {
      return { start: null, end: null };
    }
    const start = `${yearRaw}-${String(month1 + 1).padStart(2, "0")}-${String(day1).padStart(2, "0")}`;
    const end = `${yearRaw}-${String(month2 + 1).padStart(2, "0")}-${String(day2).padStart(2, "0")}`;
    return { start, end };
  }

  if (single) {
    const month = parseMonthIndex(single[1]);
    const day = Number(single[2]);
    const yearRaw = single[3] ? Number(single[3]) : now.getFullYear();
    if (month === null || !Number.isFinite(day)) return { start: null, end: null };
    const iso = `${yearRaw}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { start: iso, end: iso };
  }

  return { start: null, end: null };
}

function normalizeStateSourceUrl(raw: string) {
  const normalized = normalizeSourceUrl(raw).canonical;
  const url = new URL(normalized);
  url.pathname = "/state-tournaments/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function parseLocation(locationText: string | null): { city: string | null; state: string | null } {
  if (!locationText) return { city: null, state: null };
  const compact = locationText.replace(/\s+/g, " ").trim();
  const match = compact.match(/(.+?),\s*([A-Z]{2})\b/);
  if (!match) return { city: compact || null, state: null };
  return { city: match[1].trim(), state: match[2].toUpperCase() };
}

function parseEventsFromStatePage(statePageUrl: string, html: string): ParsedEvent[] {
  const $ = cheerio.load(html);
  const fallbackState = stateCodeFromHost(new URL(statePageUrl).hostname);
  const events: ParsedEvent[] = [];
  $("div.event-block.grid-item").each((_, el) => {
    const block = $(el);
    const titleEl = block.find("a.event-block-info-title").first();
    const name = titleEl.text().replace(/\s+/g, " ").trim();
    if (!name) return;
    const href = titleEl.attr("href")?.trim() || null;
    const lis = block
      .find("ul.text-side-list li")
      .map((__, li) => $(li).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);
    const dateText = block.find(".text-side-date").first().text().replace(/\s+/g, " ").trim() || null;
    const level = lis.find((v) => /\b\d+U\b/i.test(v)) || null;
    const locationText = lis.find((v) => /,\s*[A-Z]{2}\b/.test(v)) || null;
    const feeText = lis.find((v) => /\$/.test(v)) || null;
    const loc = parseLocation(locationText);
    events.push({
      name,
      url: href,
      state: loc.state ?? fallbackState,
      city: loc.city,
      level,
      dateText,
      feeText,
      sourcePageUrl: statePageUrl,
    });
  });
  return events;
}

function discoverStatePagesFromDirectory(html: string) {
  const urls = new Set<string>();
  const re = /href="(https:\/\/[a-z]{2}baseball\.usssa\.com[^"]*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    try {
      urls.add(normalizeStateSourceUrl(match[1]));
    } catch {
      // ignore invalid urls
    }
  }
  return Array.from(urls).sort();
}

async function fetchStatePage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(url, {
      headers: { "user-agent": "RI-USSSA-Baseball-Sweep/1.0" },
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function toRow(event: ParsedEvent, status: TournamentStatus): TournamentRow {
  let eventUrl = event.sourcePageUrl;
  if (event.url) {
    try {
      eventUrl = normalizeSourceUrl(new URL(event.url, event.sourcePageUrl).toString()).canonical;
    } catch {
      eventUrl = event.sourcePageUrl;
    }
  }
  const parsed = new URL(eventUrl);
  const dates = parseDateRange(event.dateText);
  const summaryParts = [event.dateText, event.level, event.feeText].filter(Boolean);
  const slug = buildTournamentSlug({
    name: event.name,
    city: event.city ?? undefined,
    state: event.state ?? undefined,
  });
  return {
    name: event.name,
    slug,
    sport: "baseball",
    level: event.level,
    sub_type: "admin",
    ref_cash_tournament: false,
    state: event.state ?? "NA",
    city: event.city ?? "Unknown",
    venue: null,
    address: null,
    start_date: dates.start,
    end_date: dates.end ?? dates.start,
    summary: summaryParts.length ? summaryParts.join(" | ") : null,
    status,
    source: "external_crawl",
    source_event_id: eventUrl,
    source_url: eventUrl,
    source_domain: parsed.hostname,
    raw: {
      source_page_url: event.sourcePageUrl,
      date_text: event.dateText,
      fee_text: event.feeText,
    },
  };
}

export function isUsssaBaseballDirectoryUrl(url: string) {
  try {
    const { canonical } = normalizeSourceUrl(url);
    const parsed = new URL(canonical);
    return parsed.hostname === "usssa.com" && /\/baseball_events\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isUsssaStateTournamentsUrl(url: string) {
  try {
    const { canonical } = normalizeSourceUrl(url);
    const parsed = new URL(canonical);
    if (!STATE_HOST_RE.test(parsed.hostname)) return false;
    return parsed.pathname === "/" || /^\/state-tournaments\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export async function sweepUsssaBaseballTournaments(params: {
  sourceUrl: string;
  html: string;
  status: TournamentStatus;
  writeDb?: boolean;
}) {
  const writeDb = params.writeDb ?? true;
  const { canonical } = normalizeSourceUrl(params.sourceUrl);

  const isDirectory = isUsssaBaseballDirectoryUrl(canonical);
  const statePages = isDirectory
    ? discoverStatePagesFromDirectory(params.html)
    : [isUsssaStateTournamentsUrl(canonical) ? normalizeStateSourceUrl(canonical) : canonical];

  if (writeDb) {
    await upsertRegistry({
      source_url: isDirectory ? USSSA_BASEBALL_EVENTS_URL : canonical,
      source_type: "association_directory",
      sport: "baseball",
      notes: "USSSA baseball source crawl.",
      is_custom_source: true,
      is_active: true,
    });
  }

  const importedSet = new Set<string>();
  const sample: UsssaBaseballSweepResult["sample"] = [];
  let found = 0;
  let statePagesProcessed = 0;

  for (const stateUrl of statePages) {
    const stateHost = new URL(stateUrl).hostname;
    const state = stateCodeFromHost(stateHost);
    const stateHtml = stateUrl === normalizeStateSourceUrl(canonical) ? params.html : await fetchStatePage(stateUrl);
    if (!stateHtml) continue;
    statePagesProcessed += 1;
    const events = parseEventsFromStatePage(stateUrl, stateHtml);
    if (!events.length) continue;
    found += events.length;

    if (writeDb) {
      await upsertRegistry({
        source_url: stateUrl,
        source_type: "association_directory",
        sport: "baseball",
        state,
        notes: "USSSA state baseball tournaments listing.",
        is_custom_source: true,
        is_active: true,
      });
    }

    for (const event of events) {
      if (sample.length < 8) {
        sample.push({
          name: event.name,
          state: event.state,
          city: event.city,
          date: event.dateText,
          url: event.url,
        });
      }
      if (!writeDb) continue;
      const id = await upsertTournamentFromSource(toRow(event, params.status));
      importedSet.add(id);
    }
  }

  const imported_ids = Array.from(importedSet);
  if (writeDb && imported_ids.length) {
    await queueEnrichmentJobs(imported_ids);
  }

  return {
    imported_ids,
    counts: {
      states_found: statePages.length,
      state_pages_processed: statePagesProcessed,
      found,
      imported: imported_ids.length,
    },
    sample,
  } satisfies UsssaBaseballSweepResult;
}
