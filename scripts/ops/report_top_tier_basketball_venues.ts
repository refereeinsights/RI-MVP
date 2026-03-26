/*
 * Report Top Tier Sports basketball tournaments + venue locations (from Exposure widgets).
 *
 * Dry-run report (default):
 *   npx tsx scripts/ops/report_top_tier_basketball_venues.ts
 *
 * Optional: write DB via crawler (dangerous-ish; prefer running the report first):
 *   TOP_TIER_CRAWL_WRITE_DB=true npx tsx scripts/ops/report_top_tier_basketball_venues.ts
 */

import fs from "node:fs";
import path from "node:path";
import { runTopTierCrawler } from "../../apps/referee/lib/admin/topTierCrawler";
import { normalizeSourceUrl } from "../../apps/referee/lib/normalizeSourceUrl";

const WRITE_DB = process.env.TOP_TIER_CRAWL_WRITE_DB === "true";
const MAX_PAGES = Number(process.env.TOP_TIER_CRAWL_MAX_PAGES || "250");
const OUT_CSV = process.env.TOP_TIER_BASKETBALL_VENUES_CSV || `tmp/top_tier_basketball_venues_${stamp()}.csv`;

function stamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(
    d.getSeconds()
  )}`;
}

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

function esc(v: unknown) {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

function normalizeKey(v: unknown) {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isSurcVenue(v: { name?: string | null; address1?: string | null; city?: string | null; state?: string | null }) {
  const blob = normalizeKey([v.name, v.address1, v.city, v.state].filter(Boolean).join(" "));
  return blob.includes("surc") || blob.includes("university way") || blob.includes("cwu") || blob.includes("ellensburg");
}

async function main() {
  loadLocalEnv();

  const { summary, rows } = await runTopTierCrawler({
    writeDb: WRITE_DB,
    maxPages: MAX_PAGES,
    sports: ["basketball"],
  });

  const { supabaseAdmin } = await import("../../apps/referee/lib/supabaseAdmin");

  ensureDirFor(OUT_CSV);
  const headers = [
    "tournament_source_url",
    "tournament_name",
    "start_date",
    "end_date",
    "city",
    "state",
    "event_id",
    "exposure_domain",
    "venues_count",
    "venue_name",
    "venue_address1",
    "venue_city",
    "venue_state",
    "venue_zip",
    "venue_url",
    "is_surc",
    "db_tournament_id",
    "db_has_any_venue_links",
  ];

  const lines: string[] = [headers.join(",")];

  for (const r of rows) {
    const normalized = normalizeSourceUrl(r.sourceUrl);
    const { data: tRow, error: tErr } = await supabaseAdmin
      .from("tournaments" as any)
      .select("id")
      .or(
        [
          `source_url.eq.${normalized.canonical}`,
          `official_website_url.eq.${normalized.canonical}`,
          `source_url.eq.${r.sourceUrl}`,
          `official_website_url.eq.${r.sourceUrl}`,
        ].join(",")
      )
      .limit(1)
      .maybeSingle();
    if (tErr) throw tErr;
    const tournamentId = tRow?.id ? String(tRow.id) : "";

    let hasLinks = false;
    if (tournamentId) {
      const { data: links, error: linkErr } = await supabaseAdmin
        .from("tournament_venues" as any)
        .select("venue_id")
        .eq("tournament_id", tournamentId)
        .limit(1);
      if (linkErr) throw linkErr;
      hasLinks = Boolean((links ?? []).length);
    }

    const venues = Array.isArray((r as any).venues) ? ((r as any).venues as any[]) : [];
    if (!venues.length) {
      lines.push(
        [
          r.sourceUrl,
          r.tournamentName,
          r.startDate,
          r.endDate,
          r.city,
          r.state,
          r.eventId,
          r.exposureDomain,
          0,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          tournamentId,
          hasLinks ? "1" : "0",
        ]
          .map(esc)
          .join(",")
      );
      continue;
    }

    for (const v of venues) {
      lines.push(
        [
          r.sourceUrl,
          r.tournamentName,
          r.startDate,
          r.endDate,
          r.city,
          r.state,
          r.eventId,
          r.exposureDomain,
          venues.length,
          v.name ?? "",
          v.address1 ?? "",
          v.city ?? "",
          v.state ?? "",
          v.zip ?? "",
          v.venueUrl ?? "",
          isSurcVenue(v) ? "1" : "0",
          tournamentId,
          hasLinks ? "1" : "0",
        ]
          .map(esc)
          .join(",")
      );
    }
  }

  fs.writeFileSync(OUT_CSV, lines.join("\n") + "\n", "utf8");

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        writeDb: WRITE_DB,
        maxPages: MAX_PAGES,
        outCsv: OUT_CSV,
        summary,
        rows: rows.length,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[top-tier-basketball-venues] fatal", err);
  process.exitCode = 1;
});

