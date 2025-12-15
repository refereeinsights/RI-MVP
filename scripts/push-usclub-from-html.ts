/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

type TournamentRow = {
  name: string;
  slug: string;
  sport: string; // "soccer"
  level?: string | null;
  state: string;
  city?: string | null;
  venue?: string | null;
  address?: string | null;
  start_date?: string | null; // YYYY-MM-DD
  end_date?: string | null; // YYYY-MM-DD
  source_url: string;
  source_domain?: string | null;
  source_title?: string | null;
  source_last_seen_at?: string | null; // ISO timestamp
  summary?: string | null;
  notes?: string | null;
  status?: string; // default 'published'
  confidence?: number; // default 50
};

type Debug = {
  htmlPath: string;
  htmlLength: number;
  monthHeadingsFound: number;
  firstMonthHeading: string | null;
  tablesFound: number;
  totalRows: number;
  rowsAllowedState: number;
  rowsInWindow: number;
  results: number;
  // extra visibility
  totalTablesInDoc: number;
  firstTableTextPreview: string | null;
};

const ALLOWED_STATES = new Set(["WA", "OR", "CA", "ID", "NV", "AZ", "HI"]);

function toISODateUTC(year: number, monthIndex0: number, day: number): string {
  const d = new Date(Date.UTC(year, monthIndex0, day, 12, 0, 0));
  return d.toISOString().slice(0, 10);
}

function monthNameToIndex0(name: string): number | null {
  const m = name.trim().toLowerCase();
  const map: Record<string, number> = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
  };
  return map[m] ?? null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function parseDateCell(
  monthYear: string,
  dateTextRaw: string
): { start?: string; end?: string } {
  const dateText = dateTextRaw
    .replace(/\u2013|\u2014/g, "-")
    .replace(/,/g, " ")
    .trim();

  const monthYearMatch = monthYear.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!monthYearMatch) return {};

  const defaultMonthName = monthYearMatch[1];
  const year = parseInt(monthYearMatch[2], 10);
  const defaultMonthIdx = monthNameToIndex0(defaultMonthName);
  if (defaultMonthIdx === null) return {};

  const explicitMonthMatch = dateText.match(/^([A-Za-z]+)\s+/);
  const explicitIdx = explicitMonthMatch
    ? monthNameToIndex0(explicitMonthMatch[1])
    : null;

  const monthIdx = explicitIdx !== null ? explicitIdx : defaultMonthIdx;

  const dayRangeMatch = dateText.match(/(\d{1,2})(?:\s*-\s*(\d{1,2}))?/);
  if (!dayRangeMatch) return {};

  const startDay = parseInt(dayRangeMatch[1], 10);
  const endDay = dayRangeMatch[2] ? parseInt(dayRangeMatch[2], 10) : startDay;

  if (startDay < 1 || startDay > 31 || endDay < 1 || endDay > 31) return {};

  return {
    start: toISODateUTC(year, monthIdx, startDay),
    end: toISODateUTC(year, monthIdx, endDay),
  };
}

function inNextNineMonths(startISO?: string | null): boolean {
  if (!startISO) return false;
  const start = new Date(`${startISO}T12:00:00Z`);
  if (Number.isNaN(start.getTime())) return false;

  const now = new Date();
  const nowMid = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0)
  );
  const endWindow = new Date(nowMid);
  endWindow.setUTCMonth(endWindow.getUTCMonth() + 9);

  return start >= nowMid && start <= endWindow;
}

function inferLevel(ageGroups: string): string | null {
  const t = (ageGroups || "").toLowerCase();
  if (!t) return null;
  if (t.includes("adult") || t.includes("open")) return "adult";
  return "youth";
}

function isValidTournamentRow(t: TournamentRow): boolean {
  return Boolean(
    t &&
      typeof t.name === "string" &&
      t.name.trim().length > 0 &&
      typeof t.slug === "string" &&
      t.slug.trim().length > 0 &&
      typeof t.sport === "string" &&
      t.sport.trim().length > 0 &&
      typeof t.state === "string" &&
      t.state.trim().length > 0 &&
      typeof t.source_url === "string" &&
      t.source_url.trim().length > 0
  );
}

function parseTournamentTable(
  $: cheerio.CheerioAPI,
  monthYear: string,
  $table: cheerio.Cheerio<any>,
  debug: Debug
): TournamentRow[] {
  const listUrl = "https://usclubsoccer.org/list-of-sanctioned-tournaments/";
  const sourceTitle = "US Club Soccer – Sanctioned Tournaments";

  const out: TournamentRow[] = [];
  const trs = $table.find("tr").toArray();

  for (const tr of trs) {
    const tds = $(tr).find("td");
    if (tds.length < 4) continue;

    debug.totalRows++;

    const datesText = $(tds[0]).text().trim();
    const tournamentCell = $(tds[1]);

    const stateRaw = $(tds[2]).text().trim().toUpperCase();
    const stateMatch = stateRaw.match(/\b[A-Z]{2}\b/);
    const state = stateMatch ? stateMatch[0] : "";

    const club = tds.length >= 4 ? $(tds[3]).text().trim() : "";
    const ageGroups = tds.length >= 5 ? $(tds[4]).text().trim() : "";

    if (!state || !ALLOWED_STATES.has(state)) continue;
    debug.rowsAllowedState++;

    const link = tournamentCell.find("a").first();
    const name = link.text().trim() || tournamentCell.text().trim();
    const href = (link.attr("href") || "").trim();
    if (!name) continue;

    const { start, end } = parseDateCell(monthYear, datesText);
    if (!start) continue;
    if (!inNextNineMonths(start)) continue;
    debug.rowsInWindow++;

    const start_date = start ?? null;
    const end_date = end ?? start ?? null;

    const slug = slugify(`${name}-${state}-${start_date ?? "unknown"}`);
    const source_url = href && href.startsWith("http") ? href : listUrl;
    const source_domain = getDomain(source_url) ?? "usclubsoccer.org";

    const level = inferLevel(ageGroups);
    const confidence = start_date ? 85 : 70;

    out.push({
      name,
      slug,
      sport: "soccer",
      level,
      state,
      city: null,
      venue: null,
      address: null,
      start_date,
      end_date,
      source_url,
      source_domain,
      source_title: sourceTitle,
      summary: `US Club Soccer–sanctioned tournament listed for ${state}${
        club ? `, hosted by ${club}` : ""
      }.`,
      confidence,
      status: "published",
    });
  }

  return out;
}

function parseUSClubHtml(html: string): { rows: TournamentRow[]; debug: Debug } {
  const $ = cheerio.load(html);

  const allTables = $("table").toArray();
  const firstTablePreview =
    allTables.length > 0 ? $(allTables[0]).text().trim().slice(0, 120) : null;

  const debug: Debug = {
    htmlPath: "",
    htmlLength: html.length,
    monthHeadingsFound: 0,
    firstMonthHeading: null,
    tablesFound: 0,
    totalRows: 0,
    rowsAllowedState: 0,
    rowsInWindow: 0,
    results: 0,
    totalTablesInDoc: allTables.length,
    firstTableTextPreview: firstTablePreview,
  };

  // Month headings exist, but tables may not be siblings.
  // ✅ Robust approach: walk elements in document order: h2 then table.
  const nodes = $("h2, table").toArray();

  let currentMonthYear: string | null = null;

  // Count headings for debug
  const headings = $("h2")
    .toArray()
    .map((h) => $(h).text().trim())
    .filter((t) => /^\w+\s+\d{4}$/.test(t));

  debug.monthHeadingsFound = headings.length;
  debug.firstMonthHeading = headings[0] ?? null;

  const results: TournamentRow[] = [];

  for (const node of nodes) {
    const $node = $(node);

    if (node.tagName === "h2") {
      const t = $node.text().trim();
      if (/^\w+\s+\d{4}$/.test(t)) {
        currentMonthYear = t;
      }
      continue;
    }

    if (node.tagName === "table") {
      if (!currentMonthYear) continue;

      // Parse the first table after each month heading.
      // After parsing one table, clear month so we don’t accidentally parse unrelated tables.
      debug.tablesFound++;
      results.push(...parseTournamentTable($, currentMonthYear, $node, debug));
      currentMonthYear = null;
    }
  }

  const valid = results.filter(isValidTournamentRow);
  debug.results = valid.length;

  return { rows: valid, debug };
}

async function postRows(args: {
  apiBaseUrl: string;
  token: string;
  dryRun: boolean;
  rows: TournamentRow[];
}) {
  const url = new URL("/api/cron/tournaments", args.apiBaseUrl);
  url.searchParams.set("token", args.token);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dryRun: args.dryRun, rows: args.rows }),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }

  if (!res.ok) {
    console.error("API POST failed:", res.status, text);
    process.exitCode = 1;
    return;
  }

  console.log("API response:", json ?? text);
}

async function main() {
  const htmlPath = path.join(process.cwd(), "fixtures", "usclub.html");
  const apiBaseUrl = process.env.RI_API_BASE_URL || "http://localhost:3000";
  const token = process.env.CRON_SECRET || process.env.RI_CRON_SECRET || "";
  const dryRun = (process.env.DRY_RUN ?? "true").toLowerCase() !== "false";

  if (!token) {
    console.error("Missing token. Set CRON_SECRET (or RI_CRON_SECRET).");
    process.exit(1);
  }
  if (!fs.existsSync(htmlPath)) {
    console.error("HTML file not found:", htmlPath);
    process.exit(1);
  }

  const html = fs.readFileSync(htmlPath, "utf-8");
  const { rows, debug } = parseUSClubHtml(html);
  debug.htmlPath = htmlPath;

  console.log("Parse debug:", debug);

  if (!rows.length) {
    console.log("No rows parsed after filters. Nothing to push.");
    return;
  }

  console.log(`Parsed ${rows.length} rows. Sending to ${apiBaseUrl} (dryRun=${dryRun})...`);
  await postRows({ apiBaseUrl, token, dryRun, rows });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
