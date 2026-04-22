#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Null out obviously-bad `venues.venue_url` values that point to TI itself.
 *
 * Default: dry-run (prints counts + sample ids).
 * Use `--apply` to write updates.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/ops/null_bad_venue_urls.ts
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/ops/null_bad_venue_urls.ts --apply
 */

import process from "node:process";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const BAD_URLS = [
  "https://www.tournamentinsights.com/venues",
  "https://www.tournamentinsights.com/venues/",
];

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const apply = hasFlag("--apply");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Fetch ids in pages since PostgREST doesn't support TRIM() filters directly.
  const pageSize = 1000;
  const ids: string[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const to = offset + pageSize - 1;
    const { data, error } = await supabase
      .from("venues")
      .select("id,venue_url")
      .in("venue_url", BAD_URLS)
      .range(offset, to);
    if (error) {
      console.error("Failed to query venues:", error.message);
      process.exit(1);
    }
    const rows = (data ?? []) as Array<{ id: string; venue_url: string | null }>;
    if (!rows.length) break;
    ids.push(...rows.map((r) => r.id));
    if (rows.length < pageSize) break;
  }

  console.log(`Matched venues with bad venue_url: ${ids.length}`);
  console.log(`Bad values: ${BAD_URLS.join(" | ")}`);
  console.log("Sample ids:", ids.slice(0, 25).join(", ") || "(none)");

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to write updates.");
    return;
  }

  if (!ids.length) {
    console.log("No updates needed.");
    return;
  }

  let updated = 0;
  const chunkSize = 500;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { error } = await supabase.from("venues").update({ venue_url: null }).in("id", chunk);
    if (error) {
      console.error("Update failed:", error.message);
      process.exit(1);
    }
    updated += chunk.length;
    if (updated % 1000 === 0 || updated === ids.length) {
      console.log(`Updated ${updated}/${ids.length}...`);
    }
  }

  console.log(`Done. Nullified venue_url for ${updated} venues.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

