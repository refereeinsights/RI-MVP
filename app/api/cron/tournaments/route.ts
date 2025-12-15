import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
  // Use UTC to avoid timezone date shifting
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

function parseDateCell(monthYear: string, dateTextRaw: string): { start?: string; end?: string } {
  // monthYear: "December 2025"
  // dateText examples: "December 6-7", "December 6", "Dec 6-7", sometimes with commas
  const dateText = dateTextRaw.replace(/\u2013|\u2014/g, "-").replace(/,/g, " ").trim();

  const monthYearMatch = monthYear.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!monthYearMatch) return {};

  const defaultMonthName = monthYearMatch[1];
  const year = parseInt(monthYearMatch[2], 10);
  const defaultMonthIdx = monthNameToIndex0(defaultMonthName);
  if (defaultMonthIdx === null) return {};

  // Try to find an explicit month name in the date cell; otherwise use monthYear heading
  const explicitMonthMatch = dateText.match(/^([A-Za-z]+)\s+/);
  const monthIdx =
    explicitMonthMatch && monthNameToIndex0(explicitMonthMatch[1]) !== null
      ? (monthNameToIndex0(explicitMonthMatch[1]) as number)
      : defaultMonthIdx;

  // Extract first day and optional range
  // Matches: "December 6-7", "December 6 - 7", "December 6", "Dec 6-7"
  const dayRangeMatch = dateText.match(/(\d{1,2})(?:\s*-\s*(\d{1,2}))?/);
  if (!dayRangeMatch) return {};

  const startDay = parseInt(dayRangeMatch[1], 10);
  const endDay = dayRangeMatch[2] ? parseInt(dayRangeMatch[2], 10) : startDay;

  // Basic validity
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
    console.error("US Club Soccer fetch failed", res.status);
    return [];
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const results: TournamentRow[] = [];

  // Month headings are typically h2 like "December 2025", "January 2026", etc.
  const monthHeadings = $("h2")
    .toArray()
    .map((h) => $(h))
    .filter(($h) => /^\w+\s+\d{4}$/.test($h.text().trim()));

  for (const $h of monthHeadings) {
    const monthYear = $h.text().trim();

    // Collect tables until the next month heading
    let node = $h.next();
    while (node.length) {
      if (node.is("h2") && /^\w+\s+\d{4}$/.test(node.text().trim())) break;

      const tables = node.is("table") ? node : node.find("table");
      tables.each((_, table) => {
        const $table = $(table);
        $table.find("tbody tr").each((__, tr) => {
          const tds = $(tr).find("td");
          if (tds.length < 4) return;

          const datesText = $(tds[0]).text().trim();
          const tournamentCell = $(tds[1]);
          const state = $(tds[2]).text().trim().toUpperCase();
          const club = tds.length >= 4 ? $(tds[3]).text().trim() : "";
          const ageGroups = tds.length >= 5 ? $(tds[4]).text().trim() : "";

          if (!state || !ALLOWED_STATES.has(state)) return;

          const link = tournamentCell.find("a").first();
          const name = link.text().trim() || tournamentCell.text().trim();
          const href = (link.attr("href") || "").trim();

          if (!name) return;

          const { start, end } = parseDateCell(monthYear, datesText);

          // If we can't confidently place it in the window, skip (keeps data quality high)
          if (!inNextNineMonths(start ?? null)) return;

          const start_date = start ?? null;
          const end_date = end ?? start ?? null;

          const slugBase = `${name}-${state}-${start_date ?? "unknown"}`;
          const slug = slugify(slugBase);

          const source_url = href && href.startsWith("http") ? href : listUrl;
          const source_domain = getDomain(source_url) ?? "usclubsoccer.org";

          const level = inferLevel(ageGroups);

          const confidence =
            start_date && state ? (club || ageGroups ? 85 : 80) : 70;

          results.push({
            name,
            slug,
            sport: "soccer",
            level,
            state,
            city: null, // US Club list typically doesn't include city
            venue: null,
            address: null,
            start_date,
            end_date,
            source_url,
            source_domain,
            source_title: "US Club Soccer – Sanctioned Tournaments",
            summary: `US Club Soccer–sanctioned tournament listed for ${state}${club ? `, hosted by ${club}` : ""}.`,
            confidence,
            // status omitted → DB default 'published'
          });
        });
      });

      node = node.next();
    }
  }

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

    // Stamp last-seen time so you can track freshness over time
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
