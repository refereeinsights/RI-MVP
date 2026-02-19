import * as cheerio from "cheerio";
import { upsertTournamentFromSource } from "@/lib/tournaments/upsertFromSource";
import { buildTournamentSlug } from "@/lib/tournaments/slug";
import type { TournamentRow, TournamentStatus } from "@/lib/types/tournament";
import { queueEnrichmentJobs } from "@/server/enrichment/pipeline";
import { normalizeSourceUrl, upsertRegistry } from "@/server/admin/sources";

const MY_HOCKEY_SEARCH_URL = "https://www.myhockeytournaments.com/search";

type ParsedEvent = {
  name: string;
  detailUrl: string | null;
  city: string | null;
  state: string | null;
  dateText: string | null;
  level: string | null;
  summary: string | null;
  sourcePageUrl: string;
};

export type MyHockeySweepResult = {
  imported_ids: string[];
  counts: {
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

function parseMonthIndex(token: string | null | undefined) {
  if (!token) return null;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const idx = months.findIndex((m) => token.toLowerCase().startsWith(m));
  return idx >= 0 ? idx : null;
}

function parseDateRange(dateText: string | null): { start: string | null; end: string | null } {
  if (!dateText) return { start: null, end: null };
  const text = dateText.replace(/\s+/g, " ").trim();
  const match = text.match(
    /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3,9})\s+(\d{1,2}),\s*(20\d{2})\s*[-–]\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3,9})\s+(\d{1,2}),\s*(20\d{2})/i
  );
  if (!match) return { start: null, end: null };
  const m1 = parseMonthIndex(match[1]);
  const d1 = Number(match[2]);
  const y1 = Number(match[3]);
  const m2 = parseMonthIndex(match[4]);
  const d2 = Number(match[5]);
  const y2 = Number(match[6]);
  if (m1 === null || m2 === null || !Number.isFinite(d1) || !Number.isFinite(d2)) {
    return { start: null, end: null };
  }
  const start = `${y1}-${String(m1 + 1).padStart(2, "0")}-${String(d1).padStart(2, "0")}`;
  const end = `${y2}-${String(m2 + 1).padStart(2, "0")}-${String(d2).padStart(2, "0")}`;
  return { start, end };
}

function parseCityState(text: string | null): { city: string | null; state: string | null } {
  if (!text) return { city: null, state: null };
  const compact = text.replace(/\s+/g, " ").trim();
  const match = compact.match(/^(.+?),\s*([A-Z]{2})$/);
  if (!match) return { city: compact || null, state: null };
  return { city: match[1].trim(), state: match[2].toUpperCase() };
}

function parseMyHockeyEvents(sourceUrl: string, html: string): ParsedEvent[] {
  const $ = cheerio.load(html);
  const out: ParsedEvent[] = [];
  $("div.row.border").each((_, row) => {
    const cols = $(row).find("> div");
    if (cols.length < 5) return;
    const nameDateRaw = $(cols[1]).text().replace(/\s+/g, " ").trim();
    const dateTextMatch = nameDateRaw.match(
      /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Za-z]{3,9}\s+\d{1,2},\s*20\d{2}\s*[-–]\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Za-z]{3,9}\s+\d{1,2},\s*20\d{2}/i
    );
    const dateText = dateTextMatch ? dateTextMatch[0] : null;
    const name = (dateText ? nameDateRaw.replace(dateText, "") : nameDateRaw)
      .replace(/\s+/g, " ")
      .trim();
    if (!name) return;

    const level = $(cols[2]).text().replace(/\s+/g, " ").trim() || null;
    const locationRaw = $(cols[3]).text().replace(/\s+/g, " ").trim() || null;
    const { city, state } = parseCityState(locationRaw);
    const href = $(cols[4]).find("a").attr("href")?.trim() || null;
    const detailUrl = href ? new URL(href, sourceUrl).toString() : null;
    const summaryParts = [dateText, level].filter(Boolean);

    out.push({
      name,
      detailUrl,
      city,
      state,
      dateText,
      level,
      summary: summaryParts.length ? summaryParts.join(" | ") : null,
      sourcePageUrl: sourceUrl,
    });
  });
  return out;
}

function toRow(event: ParsedEvent, status: TournamentStatus): TournamentRow {
  const sourceUrl = event.detailUrl ? normalizeSourceUrl(event.detailUrl).canonical : normalizeSourceUrl(event.sourcePageUrl).canonical;
  const parsed = new URL(sourceUrl);
  const dates = parseDateRange(event.dateText);
  const slug = buildTournamentSlug({
    name: event.name,
    city: event.city ?? undefined,
    state: event.state ?? undefined,
  });
  return {
    name: event.name,
    slug,
    sport: "hockey",
    level: event.level,
    sub_type: "admin",
    ref_cash_tournament: false,
    state: event.state ?? "NA",
    city: event.city ?? "Unknown",
    venue: null,
    address: null,
    start_date: dates.start,
    end_date: dates.end ?? dates.start,
    summary: event.summary,
    status,
    source: "external_crawl",
    source_event_id: sourceUrl,
    source_url: sourceUrl,
    source_domain: parsed.hostname,
    raw: {
      source_page_url: event.sourcePageUrl,
      date_text: event.dateText,
      level_text: event.level,
    },
  };
}

export function isMyHockeySearchUrl(url: string) {
  try {
    const { canonical } = normalizeSourceUrl(url);
    const parsed = new URL(canonical);
    const host = parsed.hostname.toLowerCase();
    const isMyHockeyHost = host === "www.myhockeytournaments.com" || host === "myhockeytournaments.com";
    return isMyHockeyHost && /^\/search\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export async function sweepMyHockeyTournaments(params: {
  sourceUrl: string;
  html: string;
  status: TournamentStatus;
  writeDb?: boolean;
}) {
  const writeDb = params.writeDb ?? true;
  const { canonical } = normalizeSourceUrl(params.sourceUrl);
  const events = parseMyHockeyEvents(canonical, params.html);
  const sample: MyHockeySweepResult["sample"] = [];

  if (writeDb) {
    await upsertRegistry({
      source_url: MY_HOCKEY_SEARCH_URL,
      source_type: "directory",
      sport: "hockey",
      notes: "MYHockeyTournaments directory listing.",
      is_custom_source: true,
      is_active: true,
    });
  }

  const importedSet = new Set<string>();
  for (const event of events) {
    if (sample.length < 8) {
      sample.push({
        name: event.name,
        state: event.state,
        city: event.city,
        date: event.dateText,
        url: event.detailUrl,
      });
    }
    if (!writeDb) continue;
    const id = await upsertTournamentFromSource(toRow(event, params.status));
    importedSet.add(id);
  }

  const imported_ids = Array.from(importedSet);
  if (writeDb && imported_ids.length) {
    await queueEnrichmentJobs(imported_ids);
  }

  return {
    imported_ids,
    counts: {
      found: events.length,
      imported: imported_ids.length,
    },
    sample,
  } satisfies MyHockeySweepResult;
}
