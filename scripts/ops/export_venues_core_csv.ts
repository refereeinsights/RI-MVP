#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Export all venues to a CSV with:
 *   venue_id, venue_name, city, state, zip, venue_url
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/ops/export_venues_core_csv.ts ~/Downloads/venues_core.csv
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

type VenueRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  venue_url: string | null;
};

function toCsvLine(values: Array<string | null | undefined>): string {
  return values
    .map((v) => {
      const value = String(v ?? "");
      if (value.includes('"') || value.includes(",") || value.includes("\n")) {
        return `"${value.replaceAll('"', '""')}"`;
      }
      return value;
    })
    .join(",");
}

function usage(exitCode: number) {
  console.error("Usage: npx tsx scripts/ops/export_venues_core_csv.ts <output-path>");
  process.exit(exitCode);
}

async function main() {
  const outArg = process.argv[2];
  if (!outArg) usage(1);

  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const outPath = path.resolve(process.cwd(), outArg.replace(/^~\//, `${process.env.HOME ?? ""}/`));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const pageSize = 1000;
  const rows: VenueRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const to = offset + pageSize - 1;
    const { data, error } = await supabase
      .from("venues")
      .select("id,name,city,state,zip,venue_url")
      .range(offset, to);
    if (error) {
      console.error("Failed to fetch venues:", error.message);
      process.exit(1);
    }
    const batch = (data ?? []) as VenueRow[];
    if (!batch.length) break;
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  const lines: string[] = [];
  lines.push(toCsvLine(["venue_id", "venue_name", "city", "state", "zip", "venue_url"]));
  for (const v of rows) {
    lines.push(
      toCsvLine([
        v.id,
        (v.name ?? "").trim(),
        (v.city ?? "").trim(),
        (v.state ?? "").trim(),
        (v.zip ?? "").trim(),
        (v.venue_url ?? "").trim(),
      ])
    );
  }

  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");
  console.log(`Wrote ${rows.length} venues to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

