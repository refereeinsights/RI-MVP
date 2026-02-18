import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

import type {
  TournamentRow,
  TournamentSource,
  TournamentStatus,
  TournamentSubmissionType,
} from "@/lib/types/tournament";
import { upsertTournamentFromSource } from "@/lib/tournaments/upsertFromSource";

export type CsvRow = Record<string, string>;

export type ParsedCsv = {
  headers: string[];
  rows: CsvRow[];
};

export const ALLOWED_SPORTS = new Set(["soccer", "basketball", "football", "lacrosse"]);

const OTHER_SPORT_KEYWORDS = [
  "volleyball",
  "lacrosse",
  "softball",
  "baseball",
  "wrestling",
  "swim",
  "swimming",
  "tennis",
  "golf",
  "track",
  "cross country",
  "rugby",
  "pickleball",
  "dance",
  "rowing",
  "crew",
  "cheer",
  "cricket",
  "field hockey",
  "martial arts",
  "karate",
  "taekwondo",
  "hockey",
];

export function parseCsv(text: string): ParsedCsv {
  const headers: string[] = [];
  const rows: CsvRow[] = [];
  const currentField: string[] = [];
  const currentRow: string[] = [];
  let insideQuotes = false;

  const pushField = () => {
    currentRow.push(currentField.join(""));
    currentField.length = 0;
  };

  const pushRow = () => {
    if (!currentRow.length) return;
    if (!headers.length) {
      headers.push(...currentRow);
    } else {
      const row: CsvRow = {};
      headers.forEach((header, index) => {
        row[header] = currentRow[index] ?? "";
      });
      rows.push(row);
    }
    currentRow.length = 0;
  };

  const chars = text.split("");
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const nextChar = chars[i + 1];
    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField.push('"');
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }
    if (char === "," && !insideQuotes) {
      pushField();
      continue;
    }
    if ((char === "\n" || char === "\r") && !insideQuotes) {
      pushField();
      pushRow();
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      continue;
    }
    currentField.push(char);
  }

  if (currentField.length || currentRow.length) {
    pushField();
    pushRow();
  }

  return { headers, rows };
}

function normalize(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function referencesOtherSports(text: string) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return OTHER_SPORT_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function makeUniqueSlug(base: string, seen: Set<string>) {
  let candidate = base;
  let counter = 2;
  while (seen.has(candidate.toLowerCase())) {
    candidate = `${base}-${counter}`;
    counter++;
  }
  return candidate;
}

export function cleanCsvRows(rows: CsvRow[]) {
  const kept: CsvRow[] = [];
  const dropped: { row: CsvRow; reason: string }[] = [];
  const seenSlugs = new Set<string>();

  for (const row of rows) {
    const name = normalize(row.name);
    if (!name) {
      dropped.push({ row, reason: "missing name" });
      continue;
    }
    if (name.length > 180) {
      dropped.push({ row, reason: "name too long" });
      continue;
    }

    const sportRaw = normalize(row.sport).toLowerCase();
    if (!ALLOWED_SPORTS.has(sportRaw)) {
      dropped.push({ row, reason: `unsupported sport "${row.sport ?? ""}"` });
      continue;
    }

    const state = normalize(row.state);
    const city = normalize(row.city);
    if (!state && !city) {
      dropped.push({ row, reason: "missing city/state" });
      continue;
    }

    const sourceUrl = normalize(row.source_url);
    if (!sourceUrl) {
      dropped.push({ row, reason: "missing source URL" });
      continue;
    }

    const summary = normalize(row.summary);
    const combined = `${name} ${summary}`.toLowerCase();
    if (referencesOtherSports(combined)) {
      dropped.push({ row, reason: "references other sport" });
      continue;
    }

    const baseSlug = normalize(row.slug) || generateSlug(name, city || null, state || null);
    const uniqueSlug = makeUniqueSlug(baseSlug, seenSlugs);
    const slugKey = uniqueSlug.toLowerCase();
    seenSlugs.add(slugKey);
    kept.push({
      ...row,
      name,
      slug: uniqueSlug,
      sport: sportRaw,
      state,
      city,
      summary,
      source_url: sourceUrl,
    });
  }

  return { kept, dropped };
}

export function csvRowsToTournamentRows(
  rows: CsvRow[],
  opts: { status: TournamentStatus; source: TournamentSource; subType?: TournamentSubmissionType }
): TournamentRow[] {
  const records: TournamentRow[] = [];
  for (const row of rows) {
    const sport = row.sport as TournamentRow["sport"];
    if (!ALLOWED_SPORTS.has(sport)) continue;

    let sourceDomain = "";
    try {
      sourceDomain = new URL(row.source_url).hostname;
    } catch {
      continue;
    }

    const cashFlag = (row.cash_tournament ?? row.cash ?? "").toLowerCase();
    const record: TournamentRow = {
      name: row.name,
      slug: row.slug,
      sport,
      level: normalize(row.level) || null,
      sub_type: opts.subType ?? "internet",
      cash_tournament: cashFlag === "true" || cashFlag === "1" || cashFlag === "yes",
      state: row.state || null,
      city: row.city || null,
      venue: normalize(row.venue) || null,
      address: normalize(row.address) || null,
      start_date: normalize(row.start_date) || null,
      end_date: normalize(row.end_date) || null,
      summary: row.summary || null,
      status: opts.status,
      source: opts.source,
      source_event_id: row.slug,
      source_url: row.source_url,
      source_domain: sourceDomain,
      raw: row,
    };
    records.push(record);
  }
  return records;
}

export function extractHtmlFromMhtml(content: string) {
  const lower = content.toLowerCase();
  const htmlIndex = lower.indexOf("<html");
  if (htmlIndex === -1) return content;
  return content.slice(htmlIndex);
}

export function extractUSClubTournamentsFromHtml(
  html: string,
  opts: {
    sport: TournamentRow["sport"];
    level?: string | null;
    status: TournamentStatus;
    source?: TournamentSource;
    subType?: TournamentSubmissionType;
  }
): TournamentRow[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const records: TournamentRow[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    let absolute: string;
    try {
      absolute = new URL(href, "https://usclubsoccer.org/").toString();
    } catch {
      return;
    }
    if (absolute.endsWith("/list-of-sanctioned-tournaments/")) return;
    if (seen.has(absolute)) return;
    seen.add(absolute);

    const title = normalize($(element).text()) || "US Club Soccer Tournament";
    const summary = normalize($(element).closest("article,div").text());
    const { city, state } = extractCityState(summary);
    const slug = generateSlug(title, city, state);

    let sourceDomain = "";
    try {
      sourceDomain = new URL(absolute).hostname;
    } catch {
      sourceDomain = "usclubsoccer.org";
    }

    records.push({
      name: title,
      slug,
      sport: opts.sport,
      sub_type: opts.subType ?? "internet",
      cash_tournament: false,
      level: opts.level ?? null,
      state,
      city,
      venue: null,
      address: null,
      start_date: null,
      end_date: null,
      summary: summary || null,
      status: opts.status,
      source: opts.source ?? "us_club_soccer",
      source_event_id: slug,
      source_url: absolute,
      source_domain: sourceDomain,
      raw: summary,
    });
  });

  return records;
}

function extractCityState(text: string) {
  const match = text.match(/([A-Za-z\s]+),\s*([A-Z]{2})/);
  if (match) {
    return { city: match[1].trim(), state: match[2].trim() };
  }
  return { city: null, state: null };
}

export function generateSlug(name: string, city: string | null, state: string | null) {
  const parts = [name];
  if (city) parts.push(city);
  if (state) parts.push(state);
  return parts
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function supabaseAdmin() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase env vars");
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function triKey(record: TournamentRow) {
  const name = (record.name || "").toLowerCase().trim();
  const city = (record.city || "").toLowerCase().trim();
  const state = (record.state || "").toLowerCase().trim();
  const start = record.start_date || "";
  return `${name}|${city}|${state}|${start}`;
}

export async function importTournamentRecords(records: TournamentRow[]) {
  let success = 0;
  const failures: { record: TournamentRow; error: string }[] = [];
  const tournamentIds: string[] = [];
  const seenKeys = new Set<string>();
  const supabase = supabaseAdmin();

  for (const record of records) {
    const key = triKey(record);
    if (seenKeys.has(key)) {
      failures.push({ record, error: "Duplicate in upload (same name/city/state/start_date)" });
      continue;
    }

    if (record.name && record.start_date) {
      const { data: existing, error: dupErr } = await supabase
        .from("tournaments")
        .select("id")
        .eq("status", "pending")
        .eq("name", record.name)
        .eq("city", record.city ?? null)
        .eq("state", record.state ?? null)
        .eq("start_date", record.start_date)
        .limit(1)
        .maybeSingle();
      if (dupErr) {
        failures.push({ record, error: dupErr.message });
        continue;
      }
      if (existing) {
        failures.push({
          record,
          error: "Skipped: pending tournament with same name/city/state/start_date exists",
        });
        continue;
      }
    }

    seenKeys.add(key);
    try {
      const id = await upsertTournamentFromSource(record);
      if (id) tournamentIds.push(id);
      success++;
    } catch (error) {
      failures.push({ record, error: (error as Error).message });
    }
  }

  return { success, failures, tournamentIds };
}

// Extract events from JSON-LD scripts (schema.org Event)
export function extractEventsFromJsonLd(
  html: string,
  opts: { sport: TournamentRow["sport"]; status: TournamentStatus; source: TournamentSource; fallbackUrl?: string | null }
): TournamentRow[] {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');
  const events: TournamentRow[] = [];

  scripts.each((_, el) => {
    const text = $(el).contents().text();
    if (!text) return;
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }
    const maybeArray = Array.isArray(data) ? data : [data];
    for (const item of maybeArray) {
      if (!item) continue;
      if (item["@type"] !== "Event") continue;
      const name = (item.name || "").trim();
      if (!name) continue;
      const start = item.startDate ? String(item.startDate).slice(0, 10) : null;
      const loc = item.location || {};
      const addressText =
        (loc.address && typeof loc.address === "string" ? loc.address : loc.address?.streetAddress || "") || "";
      let city: string | null = null;
      let state: string | null = null;
      const addrMatch = addressText.match(/([A-Za-z .'-]+),\s*([A-Z]{2})\b/);
      if (addrMatch) {
        city = addrMatch[1].trim();
        state = addrMatch[2].trim();
      }
      const slug = generateSlug(name, city, state);
      const url = (item.url as string) || opts.fallbackUrl || "";
      let sourceDomain = "";
      try {
        if (url) sourceDomain = new URL(url).hostname;
      } catch {
        sourceDomain = "";
      }

      events.push({
        name,
        slug,
        sport: opts.sport,
        level: loc.name ?? null,
        sub_type: "admin",
        cash_tournament: false,
        state: state ?? null,
        city: city ?? null,
        venue: loc.name ?? null,
        address: addressText || null,
        start_date: start,
        end_date: start,
        summary: item.description ?? null,
        status: opts.status,
        source: opts.source,
        source_event_id: url || slug,
        source_url: url || opts.fallbackUrl || "",
        source_domain: sourceDomain,
        raw: item,
      });
    }
  });

  return events;
}

function parseDateRange(text: string): { start: string | null; end: string | null } {
  const rangeRegex = /([A-Za-z]+)\s+(\d{1,2})(?:[-–](\d{1,2}))?,\s*(\d{4})/;
  const singleRegex = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/;
  const months = [
    "january","february","march","april","may","june","july","august","september","october","november","december"
  ];
  const toIso = (m: string, d: string, y: string) => {
    const idx = months.indexOf(m.toLowerCase());
    if (idx === -1) return null;
    const mm = String(idx + 1).padStart(2, "0");
    const dd = String(Number(d)).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  };
  const rangeMatch = text.match(rangeRegex);
  if (rangeMatch) {
    const [, m, d1, d2, y] = rangeMatch;
    const start = toIso(m, d1, y);
    const end = d2 ? toIso(m, d2, y) : start;
    return { start: start ?? null, end: end ?? start ?? null };
  }
  const singleMatch = text.match(singleRegex);
  if (singleMatch) {
    const [, m, d, y] = singleMatch;
    const iso = toIso(m, d, y);
    return { start: iso, end: iso };
  }
  return { start: null, end: null };
}

// Domain-specific extractor for grassroots365.com calendar tables.
export function extractGrassrootsCalendar(
  html: string,
  opts: { sport: TournamentRow["sport"]; status: TournamentStatus; source: TournamentSource; fallbackUrl?: string | null }
): TournamentRow[] {
  const $ = cheerio.load(html);
  const rows: TournamentRow[] = [];

  // 1) Try to parse the embedded console.log JSON that contains all events by month.
  const consoleMatch = html.match(/console\.log\((\{[\s\S]*?\})\);/);
  if (consoleMatch) {
    try {
      const data = JSON.parse(consoleMatch[1]);
      for (const monthKey of Object.keys(data)) {
        const events = Array.isArray(data[monthKey]) ? data[monthKey] : [];
        for (const ev of events) {
          const datesStr = typeof ev.dates === "string" ? ev.dates : "";
          const dateParts = datesStr.split("|").map((d: string) => d.trim()).filter(Boolean);
          const firstDate = dateParts[0] || "";
          const lastDate = dateParts[dateParts.length - 1] || firstDate;
          const startParsed = parseDateRange(firstDate);
          const endParsed = parseDateRange(lastDate);
          const locText = (ev.locations as string | undefined) || "";
          let city: string | null = null;
          let state: string | null = null;
          const cityStateMatch = locText.match(/\(([A-Za-z .'-]+),\s*([A-Z]{2})\)/);
          if (cityStateMatch) {
            city = cityStateMatch[1].trim();
            state = cityStateMatch[2].trim();
          }
          const name: string = ev.name || ev.short_name || "Unnamed event";
          const slug = generateSlug(name, city, state);
          const url = (ev.link as string | undefined) || opts.fallbackUrl || "";
          let sourceDomain = "";
          try {
            if (url) sourceDomain = new URL(url).hostname;
          } catch {
            sourceDomain = "";
          }
          rows.push({
            name,
            slug,
            sport: opts.sport,
            level: null,
            sub_type: "admin",
            cash_tournament: false,
            state: state ?? "NA",
            city: city ?? "Unknown",
            venue: locText ? locText.replace(/\s*\([^)]+\)\s*$/, "").trim() || locText : null,
            address: locText || null,
            start_date: startParsed.start,
            end_date: endParsed.end ?? startParsed.start,
            summary: ev.description ?? datesStr,
            status: opts.status,
            source: opts.source,
            source_event_id: ev.id ? String(ev.id) : `${slug}-${startParsed.start ?? datesStr}`,
            source_url: url,
            source_domain: sourceDomain,
            raw: ev,
          });
        }
      }
    } catch (err) {
      // ignore JSON parse errors; fall back to table parsing
    }
  }

  // 2) Parse visible tables as fallback.
  const tables = $(".calendarMonthContainer table");
  tables.each((_, table) => {
    $(table)
      .find("tr")
      .each((idx, tr) => {
        if (idx === 0) return; // skip header
        const cells = $(tr).find("td");
        if (cells.length < 3) return;
        const dateText = $(cells[0]).text().replace(/\s+/g, " ").trim();
        const name = $(cells[1]).text().replace(/\s+/g, " ").trim();
        const locText = $(cells[2]).text().replace(/\s+/g, " ").trim();
        if (!name) return;
        const { start, end } = parseDateRange(dateText);
        let city: string | null = null;
        let state: string | null = null;
        const cityStateMatch = locText.match(/\(([A-Za-z .'-]+),\s*([A-Z]{2})\)/);
        if (cityStateMatch) {
          city = cityStateMatch[1].trim();
          state = cityStateMatch[2].trim();
        }
        const venue = locText.replace(/\s*\([^)]+\)\s*$/, "").trim() || locText;
        const slug = generateSlug(name, city, state);
        const url = opts.fallbackUrl || "";
        let sourceDomain = "";
        try {
          if (url) sourceDomain = new URL(url).hostname;
        } catch {
          sourceDomain = "";
        }

        rows.push({
          name,
          slug,
          sport: opts.sport,
          level: null,
          sub_type: "admin",
          cash_tournament: false,
          state: state ?? "NA",
          city: city ?? "Unknown",
          venue: venue || null,
          address: locText || null,
          start_date: start,
          end_date: end ?? start,
          summary: dateText,
          status: opts.status,
          source: opts.source,
          source_event_id: `${slug}-${start ?? dateText}`,
          source_url: url,
          source_domain: sourceDomain,
          raw: { date: dateText, venue: locText },
        });
      });
  });
  return rows;
}
