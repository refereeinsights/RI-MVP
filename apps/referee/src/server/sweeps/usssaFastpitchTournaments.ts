import * as cheerio from "cheerio";
import { upsertTournamentFromSource } from "@/lib/tournaments/upsertFromSource";
import { buildTournamentSlug } from "@/lib/tournaments/slug";
import type { TournamentRow, TournamentStatus } from "@/lib/types/tournament";
import { queueEnrichmentJobs } from "@/server/enrichment/pipeline";
import { normalizeSourceUrl, upsertRegistry } from "@/server/admin/sources";

type ParsedEvent = {
  name: string;
  url: string;
  state: string | null;
  city: string | null;
  level: string | null;
  dateText: string | null;
  feeText: string | null;
  director: string | null;
  sourcePageUrl: string;
};

type EventDetails = {
  start_date: string | null;
  end_date: string | null;
  venue_name: string | null;
  address_text: string | null;
};

export type UsssaFastpitchSweepResult = {
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
    url: string;
    venue: string | null;
  }>;
};

const FASTPITCH_HOST_RE = /(^|\.)[a-z0-9-]*fastpitch\.usssa\.com$/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

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
    return {
      start: `${yearRaw}-${String(month1 + 1).padStart(2, "0")}-${String(day1).padStart(2, "0")}`,
      end: `${yearRaw}-${String(month2 + 1).padStart(2, "0")}-${String(day2).padStart(2, "0")}`,
    };
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

function clean(value: string | null | undefined) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function parseLocation(locationText: string | null): { city: string | null; state: string | null } {
  if (!locationText) return { city: null, state: null };
  const compact = locationText.replace(/\s+/g, " ").trim();
  const match = compact.match(/(.+?),\s*([A-Z]{2})\b/);
  if (!match) return { city: compact || null, state: null };
  return { city: match[1].trim(), state: match[2].toUpperCase() };
}

function parseEventsFromPage(pageUrl: string, html: string): ParsedEvent[] {
  const $ = cheerio.load(html);
  const events = new Map<string, ParsedEvent>();

  $("div.event-block.grid-item").each((_idx, el) => {
    const block = $(el);
    const titleEl = block.find("a.event-block-info-title").first();
    const href = clean(titleEl.attr("href"));
    const name = clean(titleEl.text());
    if (!href || !name) return;

    let eventUrl = href;
    try {
      eventUrl = normalizeSourceUrl(new URL(href, pageUrl).toString()).canonical;
    } catch {
      return;
    }

    const lists: string[][] = [];
    block.find("ul.text-side-list").each((_idx, ul) => {
      const values = $(ul)
        .find("li")
        .map((__, li) => clean($(li).text()))
        .get()
        .filter((value): value is string => Boolean(value));
      lists.push(values);
    });

    const primary = lists[0] ?? [];
    const secondary = lists[1] ?? [];
    const locationText = primary.find((v) => /,\s*[A-Z]{2}\b/.test(v ?? "")) ?? null;
    const loc = parseLocation(locationText);
    const level = primary.find((v) => /\b\d{1,2}U\b/i.test(v ?? "") || /high school|women/i.test(v ?? "")) ?? null;
    const feeText = secondary.find((v) => /\$/.test(v ?? "")) ?? null;
    const director = secondary.find((v) => v && !/\$/.test(v) && !/^\d+$/.test(v)) ?? null;
    const dateText = clean(block.find(".text-side-date").first().text());

    events.set(eventUrl, {
      name,
      url: eventUrl,
      state: loc.state,
      city: loc.city,
      level,
      dateText,
      feeText,
      director,
      sourcePageUrl: pageUrl,
    });
  });

  return Array.from(events.values());
}

function asIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseJsonLdDetails($: cheerio.CheerioAPI): EventDetails {
  const details: EventDetails = {
    start_date: null,
    end_date: null,
    venue_name: null,
    address_text: null,
  };

  $("script[type='application/ld+json']").each((_idx, el) => {
    const raw = ($(el).html() || "").trim();
    if (!raw) return;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const typeRaw = item["@type"];
      const type = Array.isArray(typeRaw) ? typeRaw.join(" ").toLowerCase() : String(typeRaw ?? "").toLowerCase();
      if (!type.includes("event")) continue;

      details.start_date = details.start_date ?? asIsoDate(item.startDate);
      details.end_date = details.end_date ?? asIsoDate(item.endDate);

      const loc = item.location;
      if (!loc || typeof loc !== "object") continue;
      details.venue_name = details.venue_name ?? clean(loc.name);
      const addr = loc.address;
      if (addr && typeof addr === "object") {
        const full = clean(
          [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].filter(Boolean).join(", ")
        );
        details.address_text = details.address_text ?? full;
      }
    }
  });

  return details;
}

function extractVenueFromTable($: cheerio.CheerioAPI): Pick<EventDetails, "venue_name" | "address_text"> {
  const row = $("table tr")
    .filter((_idx, tr) => $(tr).find("td").length >= 2)
    .first();
  if (!row.length) return { venue_name: null, address_text: null };
  const tds = row.find("td");
  return {
    venue_name: clean($(tds[0]).text()),
    address_text: clean($(tds[1]).text()),
  };
}

async function fetchEventDetails(url: string): Promise<EventDetails> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(url, {
      headers: { "user-agent": "RI-USSSA-Fastpitch-Sweep/1.0" },
      signal: controller.signal,
    });
    if (!resp.ok) return { start_date: null, end_date: null, venue_name: null, address_text: null };
    const html = await resp.text();
    const $ = cheerio.load(html);
    const ld = parseJsonLdDetails($);
    const table = extractVenueFromTable($);
    return {
      start_date: ld.start_date,
      end_date: ld.end_date,
      venue_name: ld.venue_name ?? table.venue_name,
      address_text: ld.address_text ?? table.address_text,
    };
  } catch {
    return { start_date: null, end_date: null, venue_name: null, address_text: null };
  } finally {
    clearTimeout(timeout);
  }
}

function toRow(event: ParsedEvent, details: EventDetails, status: TournamentStatus): TournamentRow {
  const fallbackDates = parseDateRange(event.dateText);
  const startDate = details.start_date ?? fallbackDates.start ?? null;
  const endDate = details.end_date ?? fallbackDates.end ?? startDate;
  const parsed = new URL(event.url);
  const summaryParts = [event.dateText, event.level, event.feeText, event.director].filter(Boolean);

  return {
    name: event.name,
    slug: buildTournamentSlug({
      name: event.name,
      city: event.city ?? undefined,
      state: event.state ?? undefined,
    }),
    sport: "softball",
    tournament_association: "USSSA Fast Pitch",
    level: event.level,
    sub_type: "admin",
    ref_cash_tournament: false,
    state: event.state ?? "NA",
    city: event.city ?? "Unknown",
    venue: details.venue_name,
    address: details.address_text,
    start_date: startDate,
    end_date: endDate,
    summary: summaryParts.length ? summaryParts.join(" | ") : null,
    status,
    source: "external_crawl",
    source_event_id: event.url,
    source_url: event.url,
    source_domain: parsed.hostname,
    raw: {
      source_page_url: event.sourcePageUrl,
      date_text: event.dateText,
      fee_text: event.feeText,
      director: event.director,
      venue_name: details.venue_name,
      address_text: details.address_text,
    },
  };
}

export function isUsssaFastpitchEventsUrl(url: string) {
  try {
    const { canonical } = normalizeSourceUrl(url);
    const parsed = new URL(canonical);
    if (!FASTPITCH_HOST_RE.test(parsed.hostname)) return false;
    return /^\/(events|past-events|state-tournaments)\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export async function sweepUsssaFastpitchTournaments(params: {
  sourceUrl: string;
  html: string;
  status: TournamentStatus;
  writeDb?: boolean;
}) {
  const writeDb = params.writeDb ?? true;
  const { canonical } = normalizeSourceUrl(params.sourceUrl);
  const events = parseEventsFromPage(canonical, params.html);

  if (writeDb) {
    await upsertRegistry({
      source_url: canonical,
      source_type: "association_directory",
      sport: "softball",
      state: events[0]?.state ?? null,
      notes: "USSSA fastpitch tournaments listing.",
      is_custom_source: true,
      is_active: true,
    });
  }

  const importedSet = new Set<string>();
  const sample: UsssaFastpitchSweepResult["sample"] = [];

  for (const event of events) {
    const details = await fetchEventDetails(event.url);
    if (sample.length < 8) {
      sample.push({
        name: event.name,
        state: event.state,
        city: event.city,
        date: details.start_date ?? event.dateText,
        url: event.url,
        venue: details.venue_name,
      });
    }
    if (!writeDb) continue;
    const id = await upsertTournamentFromSource(toRow(event, details, params.status));
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
  } satisfies UsssaFastpitchSweepResult;
}
