/*
 * Top Tier crawler runner.
 *
 * Dry-run (default):
 *   npx tsx scripts/ingest/crawl_top_tier_tournaments.ts
 *
 * Write DB + venue links:
 *   TOP_TIER_CRAWL_WRITE_DB=true npx tsx scripts/ingest/crawl_top_tier_tournaments.ts
 */

import fs from "node:fs";
import path from "node:path";
import { runTopTierCrawler } from "../../apps/referee/lib/admin/topTierCrawler";

const WRITE_DB = process.env.TOP_TIER_CRAWL_WRITE_DB === "true";
const JSON_OUT = process.env.TOP_TIER_CRAWL_JSON || "tmp/top_tier_tournaments.json";
const CSV_OUT = process.env.TOP_TIER_CRAWL_CSV || "tmp/top_tier_tournaments.csv";
const MAX_PAGES = Number(process.env.TOP_TIER_CRAWL_MAX_PAGES || "250");

function loadLocalEnv() {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function ensureDirFor(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function toCsv(rows: any[]): string {
  const headers = [
    "tournament_name",
    "sport",
    "start_date",
    "end_date",
    "city",
    "state",
    "source_url",
    "event_id",
    "exposure_domain",
    "confidence",
    "venues_count",
  ];
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.tournamentName,
        r.sport,
        r.startDate,
        r.endDate,
        r.city,
        r.state,
        r.sourceUrl,
        r.eventId,
        r.exposureDomain,
        r.confidence,
        Array.isArray(r.venues) ? r.venues.length : 0,
      ]
        .map(esc)
        .join(",")
    ),
  ].join("\n");
}

async function main() {
  loadLocalEnv();
  const { summary, rows } = await runTopTierCrawler({
    writeDb: WRITE_DB,
    maxPages: MAX_PAGES,
  });

  ensureDirFor(JSON_OUT);
  ensureDirFor(CSV_OUT);
  fs.writeFileSync(JSON_OUT, JSON.stringify(rows, null, 2), "utf8");
  fs.writeFileSync(CSV_OUT, toCsv(rows), "utf8");

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        writeDb: WRITE_DB,
        maxPages: MAX_PAGES,
        json: JSON_OUT,
        csv: CSV_OUT,
        summary,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[top-tier-crawl] fatal", err);
  process.exitCode = 1;
});
