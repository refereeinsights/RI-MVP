import * as cheerio from "cheerio";

import type { TournamentRow, TournamentSource, TournamentStatus } from "@/lib/types/tournament";
import { upsertTournamentFromSource } from "@/lib/tournaments/upsertFromSource";

export type CsvRow = Record<string, string>;

export type ParsedCsv = {
  headers: string[];
  rows: CsvRow[];
};

export const ALLOWED_SPORTS = new Set(["soccer", "basketball", "football"]);

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
    const slug = normalize(row.slug);
    if (!slug) {
      dropped.push({ row, reason: "missing slug" });
      continue;
    }
    const slugKey = slug.toLowerCase();
    if (seenSlugs.has(slugKey)) {
      dropped.push({ row, reason: "duplicate slug" });
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

    seenSlugs.add(slugKey);
    kept.push({
      ...row,
      name,
      slug,
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
  opts: { status: TournamentStatus; source: TournamentSource }
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

    const record: TournamentRow = {
      name: row.name,
      slug: row.slug,
      sport,
      level: normalize(row.level) || null,
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

function generateSlug(name: string, city: string | null, state: string | null) {
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

export async function importTournamentRecords(records: TournamentRow[]) {
  let success = 0;
  const failures: { record: TournamentRow; error: string }[] = [];

  for (const record of records) {
    try {
      await upsertTournamentFromSource(record);
      success++;
    } catch (error) {
      failures.push({ record, error: (error as Error).message });
    }
  }

  return { success, failures };
}
