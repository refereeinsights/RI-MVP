import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  const start = new Date(startISO + "T00:00:00Z");
  if (Number.isNaN(start.getTime())) return false;

  const now = new Date();
  const endWindow = new Date();
  endWindow.setMonth(endWindow.getMonth() + 9);

  return start >= now && start <= endWindow;
}

function inferLevel(ageGroups: string): string | null {
  const t = (ageGroups || "").toLowerCase();
  if (!t) return null;
  if (t.includes("adult") || t.includes("open")) return "adult";
  return "youth";
}

async function getNewTournaments(): Promise<TournamentRow[]> {
  const listUrl = "https://usclubsoccer.org/list-of-sanctioned-tournaments/";

  const res = await fetch(listUrl, { cache: "no-store" });
  if (!res.ok) {
    console.error("USClub fetch failed:", res.status);
    return [];
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const monthHeadings = $("h2")
    .toArray()
    .map((h) => $(h).text().trim())
    .filter((t) => /^\w+\s+\d{4}$/.test(t));

  const tables = $("table").toArray();
  const pairCount = Math.min(monthHeadings.length, tables.length);

  // Lightweight counters (one summary log)
  let totalRows = 0;
  let rowsAllowedState = 0;
  let rowsInWindow = 0;

  const results: TournamentRow[] = [];

  for (let i = 0; i < pairCount; i++) {
    const monthYear = monthHeadings[i];
    const $table = $(tables[i]);

    const trs = $table.find("tr").toArray();
    for (const tr of trs) {
      const tds = $(tr).find("td");
      if (tds.length < 4) continue;

      totalRows++;

      const datesText = $(tds[0]).text().trim();
      const tournamentCell = $(tds[1]);

      const stateRaw = $(tds[2]).text().trim().toUpperCase();
      const stateMatch = stateRaw.match(/\b[A-Z]{2}\b/);
      const state = stateMatch ? stateMatch[0] : "";

      const club = tds.length >= 4 ? $(tds[3]).text().trim() : "";
      const ageGroups = tds.length >= 5 ? $(tds[4]).text().trim() : "";

      if (!state || !ALLOWED_STATES.has(state)) continue;
      rowsAllowedState++;

      const link = tournamentCell.find("a").first();
      const name = link.text().trim() || tournamentCell.text().trim();
      const href = (link.attr("href") || "").trim();

      if (!name) continue;

      const { start, end } = parseDateCell(monthYear, datesText);
      if (!start) continue;
      if (!inNextNineMonths(start)) continue;
      rowsInWindow++;

      const start_date = start ?? null;
      const end_date = end ?? start ?? null;

      const slug = slugify(`${name}-${state}-${start_date ?? "unknown"}`);

      const source_url = href && href.startsWith("http") ? href : listUrl;
      const source_domain = getDomain(source_url) ?? "usclubsoccer.org";

      const level = inferLevel(ageGroups);
      const confidence = start_date ? 85 : 70;

      results.push({
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
        source_title: "US Club Soccer – Sanctioned Tournaments",
        summary: `US Club Soccer–sanctioned tournament listed for ${state}${
          club ? `, hosted by ${club}` : ""
        }.`,
        confidence,
      });
    }
  }

  console.log("USClub summary:", {
    totalRows,
    rowsAllowedState,
    rowsInWindow,
    results: results.length,
  });

  return results;
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const dryRun = searchParams.get("dryRun") === "true";

    if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("RI tournament cron running", { dryRun });

    const discovered = await getNewTournaments();

    if (!discovered.length) {
      return NextResponse.json({
        dryRun,
        upserted: 0,
        message: "No new tournaments",
      });
    }

    const valid = discovered.filter(isValidTournamentRow);
    if (!valid.length) {
      return NextResponse.json({
        dryRun,
        upserted: 0,
        message: "No valid tournaments to upsert",
      });
    }

    const nowIso = new Date().toISOString();
    const rows: TournamentRow[] = valid.map((t) => ({
      ...t,
      source_last_seen_at: nowIso,
    }));

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        wouldInsert: rows.length,
        tournaments: rows,
      });
    }

    const { data, error } = await supabase
      .from("tournaments")
      .upsert(rows, { onConflict: "slug" })
      .select("id, slug");

    if (error) {
      console.error("Supabase upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      dryRun: false,
      upserted: data?.length ?? 0,
      rows: data ?? [],
    });
  } catch (err: any) {
    console.error("Cron failed:", err);
    return NextResponse.json(
      { error: "Cron failed", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
