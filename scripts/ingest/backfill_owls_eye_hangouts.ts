#!/usr/bin/env tsx
/**
 * Re-runs the hangouts category for venues with upcoming tournaments (now – Oct 2026).
 * Sorted by nearest tournament date so the most-urgent venues run first.
 * Pauses after the first two venues so you can inspect results before bulk processing.
 *
 * This is the second quality-pass backfill (May 2026). Changes vs. first pass:
 *   - Zero strong indoor results now returns empty (no park/mall padding).
 *   - 1–2 strong indoor results returns thin + low_coverage=true (no padding).
 *   - 3+ strong indoor results allows at most 1 lower-fit backfill.
 *   - Parks/playgrounds require ≥3 strong indoor results to appear at all.
 *   - Tier system renumbered: activities (arcade/bowling/etc.) now outrank
 *     brewery-without-food and sports-bar-with-food.
 *   - Junk name suppression covers lowercase handles, camelCase portmanteaus,
 *     and short odd-apostrophe names; overridden by strong indoor tags.
 *   - lowCoverage now based on strong indoor scarcity, not raw candidate count.
 *
 * Usage:
 *   tsx scripts/ingest/backfill_owls_eye_hangouts.ts           # dry run (list only)
 *   tsx scripts/ingest/backfill_owls_eye_hangouts.ts --apply   # execute re-runs
 *
 * Required env (via .env.local or process env):
 *   NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OWLS_EYE_ADMIN_TOKEN   — must match the referee app's OWLS_EYE_ADMIN_TOKEN
 *   REFEREE_APP_URL        — base URL of the running referee app (default: http://localhost:3000)
 *
 * The referee app must be running (locally or prod) for --apply to work.
 * Recommend setting FOURSQUARE_MONTHLY_CALL_LIMIT=10000 before running.
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const CUTOFF_DATE = "2026-10-31";
const TODAY = new Date().toISOString().slice(0, 10);
const VALIDATION_COUNT = 2;
const PAGE = 500;
const BATCH_DELAY_MS = 700;

function loadEnvFile(envPath: string) {
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

function loadLocalEnv() {
  // Load root .env.local first, then referee app env as fallback for FSQ/Supabase keys.
  loadEnvFile(path.resolve(".env.local"));
  loadEnvFile(path.resolve("apps/referee/.env.local"));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type Target = { venue_id: string; sport: string; nearest_date: string };

async function main() {
  loadLocalEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  const adminToken = process.env.OWLS_EYE_ADMIN_TOKEN || "";
  const apiBase = (process.env.REFEREE_APP_URL || "http://localhost:3000").replace(/\/$/, "");

  // If the token is unset, fall back to "dev". The referee app accepts any non-empty
  // header token when its own OWLS_EYE_ADMIN_TOKEN env var is also unset (local dev).
  const effectiveToken = adminToken || "dev";
  if (APPLY && !adminToken) {
    console.warn("[warn] OWLS_EYE_ADMIN_TOKEN not set — using 'dev' token (only works if referee app also has no token configured).");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Step 1: collect owls_eye_runs that have hangouts ─────────────────────
  console.log("Fetching owls_eye_runs with hangouts…");
  const runsByVenue = new Map<string, string>(); // venue_id → sport (most recent run first)

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await (supabase
      .from("owls_eye_runs" as any) as any)
      .select("venue_id,sport,categories_fetched,created_at")
      .not("categories_fetched", "is", null)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`owls_eye_runs: ${error.message}`);
    if (!data?.length) break;

    for (const row of data as any[]) {
      const vid = row.venue_id as string | null;
      const sport = row.sport as string | null;
      if (!vid || !sport) continue;
      const cats: string[] = Array.isArray(row.categories_fetched) ? row.categories_fetched : [];
      if (!cats.includes("hangouts")) continue;
      if (!runsByVenue.has(vid)) runsByVenue.set(vid, sport);
    }

    if (data.length < PAGE) break;
  }
  console.log(`  ${runsByVenue.size} venues with hangouts runs found.`);

  // ── Step 2: upcoming tournaments now → CUTOFF_DATE ────────────────────────
  console.log(`Fetching upcoming tournaments (${TODAY} → ${CUTOFF_DATE})…`);
  const tournamentDates = new Map<string, string>(); // tournament_id → start_date

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await (supabase
      .from("tournaments" as any) as any)
      .select("id,start_date")
      .gte("start_date", TODAY)
      .lte("start_date", CUTOFF_DATE)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`tournaments: ${error.message}`);
    if (!data?.length) break;
    for (const row of data as any[]) {
      if (row.id && row.start_date) tournamentDates.set(row.id as string, row.start_date as string);
    }
    if (data.length < PAGE) break;
  }
  console.log(`  ${tournamentDates.size} upcoming tournaments found.`);

  // ── Step 3: venue → nearest upcoming tournament date ──────────────────────
  const venueNearestDate = new Map<string, string>();
  const tournamentIds = Array.from(tournamentDates.keys());

  for (const ids of chunk(tournamentIds, 200)) {
    const { data, error } = await (supabase
      .from("tournament_venues" as any) as any)
      .select("venue_id,tournament_id")
      .in("tournament_id", ids)
      .eq("is_inferred", false);

    if (error) throw new Error(`tournament_venues: ${error.message}`);
    for (const row of (data as any[] ?? [])) {
      const vid = row.venue_id as string | null;
      const tid = row.tournament_id as string | null;
      if (!vid || !tid) continue;
      const date = tournamentDates.get(tid);
      if (!date) continue;
      const current = venueNearestDate.get(vid);
      if (!current || date < current) venueNearestDate.set(vid, date);
    }
  }
  console.log(`  ${venueNearestDate.size} venues have an upcoming tournament.`);

  // ── Step 4: intersect and sort ─────────────────────────────────────────────
  const targets: Target[] = [];
  for (const [venue_id, sport] of runsByVenue) {
    const nearest_date = venueNearestDate.get(venue_id);
    if (!nearest_date) continue;
    targets.push({ venue_id, sport, nearest_date });
  }
  targets.sort((a, b) => a.nearest_date.localeCompare(b.nearest_date));
  console.log(`\nVenues to re-run: ${targets.length} (sorted by nearest tournament)\n`);

  // ── Step 5: fetch venue names for display ─────────────────────────────────
  const venueNames = new Map<string, string>();
  for (const ids of chunk(targets.map((t) => t.venue_id), 200)) {
    const { data } = await (supabase
      .from("venues" as any) as any)
      .select("id,name")
      .in("id", ids);
    for (const row of (data as any[] ?? [])) {
      if (row.id && row.name) venueNames.set(row.id as string, row.name as string);
    }
  }

  // ── Dry run ────────────────────────────────────────────────────────────────
  if (!APPLY) {
    console.log("Dry run — pass --apply to execute.\n");
    const preview = targets.slice(0, 25);
    for (let i = 0; i < preview.length; i++) {
      const t = preview[i];
      console.log(`  ${String(i + 1).padStart(3)}. [${t.nearest_date}] ${venueNames.get(t.venue_id) ?? t.venue_id} (${t.sport})`);
    }
    if (targets.length > 25) console.log(`  … and ${targets.length - 25} more.`);
    console.log("\nRun with --apply to start.");
    return;
  }

  // ── Apply ──────────────────────────────────────────────────────────────────
  const rl = createInterface({ input, output });
  let validated = false;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const name = venueNames.get(t.venue_id) ?? t.venue_id;
    const label = `[${i + 1}/${targets.length}]`;

    process.stdout.write(`\n${label} ${name} (${t.sport}) | next tournament: ${t.nearest_date}\n`);

    let result: any;
    try {
      const resp = await fetch(`${apiBase}/api/admin/owls-eye/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-owls-eye-admin-token": effectiveToken,
        },
        body: JSON.stringify({
          venue_id: t.venue_id,
          sport: t.sport,
          force: true,
          categories: ["hangouts"],
        }),
        signal: AbortSignal.timeout(90_000),
      });
      result = await resp.json();
    } catch (err) {
      console.error(`  ERROR: ${(err as any)?.message ?? err}`);
      if (!validated) {
        const ans = await rl.question("  Continue anyway? [y/N] ");
        if (ans.trim().toLowerCase() !== "y") { rl.close(); return; }
      }
      continue;
    }

    if (!result?.ok) {
      const errCode = result?.error ?? "";
      if (errCode === "budget_exceeded" || String(errCode).includes("budget")) {
        console.log("  Monthly FSQ budget reached — stopping.");
        break;
      }
      console.error(`  API error: ${errCode || JSON.stringify(result)}`);
    } else {
      const hangouts: string[] = result.nearby_names?.hangouts ?? [];
      const preview = hangouts.slice(0, 6).join(", ");
      const tail = hangouts.length > 6 ? ` +${hangouts.length - 6} more` : "";
      console.log(`  Hangouts (${hangouts.length}): ${preview || "(none)"}${tail}`);
    }

    // Pause for validation after the first VALIDATION_COUNT venues
    if (!validated && i + 1 >= VALIDATION_COUNT) {
      console.log("\n── Validation checkpoint ──────────────────────────────");
      const ans = await rl.question("Results look good? Continue with remaining venues? [y/N] ");
      if (ans.trim().toLowerCase() !== "y") {
        console.log("Aborted.");
        rl.close();
        return;
      }
      validated = true;
      console.log("Continuing…\n");
    }

    if (i < targets.length - 1) await sleep(BATCH_DELAY_MS);
  }

  rl.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
