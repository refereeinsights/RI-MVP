/*
 * Starter tournament crawler (dry-run by default).
 * Usage:
 *   CRAWL_ENABLED=true CRAWL_DRY_RUN=true tsx scripts/crawl-tournaments.ts
 *
 * Safeguards:
 * - Exits immediately unless CRAWL_ENABLED === "true".
 * - When CRAWL_DRY_RUN !== "false", it will only log findings (no writes).
 */

import { load as cheerioLoad } from "cheerio";
import { buildTournamentSlug } from "../apps/referee/lib/tournaments/slug";
import { normalizeSourceUrl } from "../apps/referee/lib/normalizeSourceUrl";
import fs from "node:fs";
import path from "node:path";

type Candidate = {
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  city?: string | null;
  state?: string | null;
  sourceUrl: string;
  title?: string | null;
  notes?: string | null;
};

const STATES = new Set(
  [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
    // territories if ever needed
    "DC","PR",
  ] as const
);

const DEFAULT_SPORT = "soccer"; // safe default; adjust per-source when known

// Add or adjust seed URLs here. Start small and expand.
const SEED_URLS: string[] = [
  // Soccer
  "https://www.usyouthsoccer.org/events/",
  "https://system.gotsport.com/org_event/events", // many orgs list here; often requires refining later
  "https://tourneymachine.com/", // discovery page; may need refining per sport
  "https://www.usclubsoccer.org/events",
  "https://events.edpsoccer.com/",
  "https://npl.aesportfolios.com/event/list",
  // Basketball
  "https://www.aaugirlsbasketball.org/Events/Events-Listing",
  "https://www.aauboysbasketball.org/Events/Events-Listing",
  "https://community.usab.com/events", // USA Basketball events
];

const CRAWL_ENABLED = process.env.CRAWL_ENABLED === "true";
const CRAWL_DRY_RUN = process.env.CRAWL_DRY_RUN !== "false"; // default to true
const EXPORT_CSV_PATH = process.env.CRAWL_EXPORT_CSV_PATH; // when set, skip DB writes and emit CSV

function log(msg: string, extra?: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[crawl] ${msg}`, extra ?? "");
}

async function fetchPage(url: string): Promise<{ html: string; status: number; title?: string }> {
  const res = await fetch(url, { redirect: "follow" });
  const html = await res.text();
  const $ = cheerioLoad(html);
  return { html, status: res.status, title: $("title").first().text().trim() || undefined };
}

function parseDate(input?: string | null): string | null {
  if (!input) return null;
  const dt = new Date(input);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

function extractCandidates(html: string, pageUrl: string): Candidate[] {
  const $ = cheerioLoad(html);
  const candidates: Candidate[] = [];

  // Heuristic: links that look like tournaments/events
  $("a").each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href");
    if (!href) return;
    const lower = text.toLowerCase();
    const looksLikeEvent = /tournament|cup|showcase|classic|event/.test(lower);
    if (!looksLikeEvent) return;

    const url = new URL(href, pageUrl).toString();
    const siblingText = $(el).parent().text();
    const locationMatch = siblingText.match(/([A-Za-z\s]+),\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)/);
    const city = locationMatch?.[1]?.trim() ?? null;
    const state = locationMatch?.[2]?.trim() ?? null;

    candidates.push({
      name: text,
      city,
      state,
      sourceUrl: url,
      notes: siblingText.trim().slice(0, 500) || undefined,
    });
  });

  // Basic de-dup by name+state
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = `${c.name}|${c.state ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch (err) {
    return null;
  }
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function upsertTournament(candidate: Candidate, pageTitle?: string) {
  if (!candidate.state) {
    log("skip: missing state", candidate);
    return null;
  }

  const { supabaseAdmin } = await import("../apps/referee/lib/supabaseAdmin");

  const slug = buildTournamentSlug({ name: candidate.name, city: candidate.city ?? undefined, state: candidate.state });
  const domain = buildDomain(candidate.sourceUrl);

  const insertPayload = {
    name: candidate.name,
    slug,
    sport: DEFAULT_SPORT,
    level: null,
    state: candidate.state,
    city: candidate.city ?? null,
    venue: candidate.notes ?? null,
    start_date: parseDate(candidate.startDate),
    end_date: parseDate(candidate.endDate),
    source_url: candidate.sourceUrl,
    source_domain: domain,
    source_title: candidate.title ?? pageTitle ?? candidate.name,
    status: "published",
    confidence: 40,
  } as const;

  const { data, error } = await supabaseAdmin
    .from("tournaments")
    .upsert(insertPayload, { onConflict: "slug" })
    .select("id")
    .single();

  if (error) {
    log("tournament upsert error", { error, insertPayload });
    return null;
  }

  return data?.id as string | null;
}

async function recordSource(tournamentId: string | null, candidate: Candidate, status: number, pageTitle?: string) {
  const { supabaseAdmin } = await import("../apps/referee/lib/supabaseAdmin");
  const normalized = normalizeSourceUrl(candidate.sourceUrl);
  const domain = buildDomain(normalized.canonical);
  const payload = {
    tournament_id: tournamentId,
    url: normalized.canonical,
    source_url: normalized.canonical,
    normalized_url: normalized.normalized,
    domain,
    title: candidate.title ?? pageTitle ?? candidate.name,
    fetched_at: new Date().toISOString(),
    http_status: status,
    content_hash: null,
    extracted_json: candidate,
    extract_confidence: 40,
  };

  const { error } = await supabaseAdmin.from("tournament_sources").upsert(payload, { onConflict: "normalized_url" });
  if (error) {
    log("tournament_sources upsert error", { error, payload });
  }
}

// CSV Export helpers
type CsvRow = Candidate & {
  slug: string;
  sport: string;
  source_domain: string | null;
};

function toCsv(rows: CsvRow[]): string {
  const headers = [
    "name",
    "slug",
    "sport",
    "city",
    "state",
    "startDate",
    "endDate",
    "sourceUrl",
    "source_domain",
    "title",
    "notes",
  ];

  const escape = (val: unknown) => {
    if (val === null || val === undefined) return "";
    const str = String(val).replace(/"/g, '""');
    return str.includes(",") || str.includes("\n") ? `"${str}"` : str;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        escape(row.name),
        escape(row.slug),
        escape(row.sport),
        escape(row.city),
        escape(row.state),
        escape(row.startDate),
        escape(row.endDate),
        escape(row.sourceUrl),
        escape(row.source_domain),
        escape(row.title),
        escape(row.notes),
      ].join(",")
    );
  }
  return lines.join("\n");
}

async function handleSeed(url: string) {
  log(`fetching ${url}`);
  const { html, status, title } = await fetchPage(url);
  const candidates = extractCandidates(html, url);
  log(`found ${candidates.length} candidates`, { url });

  // CSV export path: collect rows and write once at end of run
  if (EXPORT_CSV_PATH) {
    return { candidates, status, title };
  }

  if (CRAWL_DRY_RUN) {
    candidates.forEach((c) => log("[dry-run] candidate", c));
    return { candidates, status, title };
  }

  for (const candidate of candidates) {
    const tournamentId = await upsertTournament(candidate, title);
    await recordSource(tournamentId, candidate, status, title);
  }

  return { candidates, status, title };
}

async function main() {
  if (!CRAWL_ENABLED) {
    log("CRAWL_ENABLED is not 'true'; exiting without work");
    return;
  }

  log(`starting crawl with ${SEED_URLS.length} seeds`, {
    dryRun: CRAWL_DRY_RUN,
    exportCsv: EXPORT_CSV_PATH ?? null,
  });

  const aggregated: { candidates: Candidate[]; status: number; title?: string }[] = [];

  for (const seed of SEED_URLS) {
    try {
      const result = await handleSeed(seed);
      if (result) aggregated.push(result);
    } catch (err) {
      log("seed error", { seed, err });
    }
  }

  if (EXPORT_CSV_PATH) {
    const rows: CsvRow[] = [];
    for (const { candidates } of aggregated) {
      for (const c of candidates) {
        if (!c.name) continue;
        const slug = buildTournamentSlug({ name: c.name, city: c.city ?? undefined, state: c.state ?? undefined });
        rows.push({
          ...c,
          slug,
          sport: DEFAULT_SPORT,
          source_domain: buildDomain(c.sourceUrl),
        });
      }
    }

    const csv = toCsv(rows);
    ensureDir(EXPORT_CSV_PATH);
    fs.writeFileSync(EXPORT_CSV_PATH, csv, "utf8");
    log(`CSV written to ${EXPORT_CSV_PATH}`, { rows: rows.length });
  }

  log("crawl complete");
}

main().catch((err) => {
  log("fatal error", err);
  process.exitCode = 1;
});
