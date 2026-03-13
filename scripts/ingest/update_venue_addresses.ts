#!/usr/bin/env ts-node
/* eslint-disable no-console */
/**
 * Update venue address fields from a CSV that contains a Supabase venue_id column.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... tsx scripts/ingest/update_venue_addresses.ts path/to/venue_address_enrichment.csv
 *
 * Expected CSV headers (case-insensitive):
 *   venue_id, venue_name?, address?, city?, state?, zip?, country?, venue_url?, source_url?, confidence?, notes?
 *
 * - Only non-empty fields are updated; blanks are ignored so we don't wipe existing data.
 * - State values are upper-cased; zip is trimmed.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

type CsvRecord = Record<string, string>;

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function usage(exitCode: number) {
  console.log("Usage: tsx scripts/ingest/update_venue_addresses.ts <path-to-csv>");
  process.exit(exitCode);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  const input = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

function loadCsv(filePath: string): CsvRecord[] {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const rows = parseCsv(raw);
  if (rows.length < 2) {
    console.error("CSV appears empty.");
    process.exit(1);
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((cols) => {
    const record: CsvRecord = {};
    headers.forEach((header, idx) => {
      record[header] = (cols[idx] ?? "").trim();
    });
    return record;
  });
}

type VenueUpdate = {
  id: string;
  name?: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  venue_url?: string | null;
};

function buildUpdates(records: CsvRecord[]): { updates: VenueUpdate[]; warnings: string[] } {
  const updates: VenueUpdate[] = [];
  const warnings: string[] = [];

  for (const [index, record] of records.entries()) {
    const row = index + 2; // account for header
    const id = record["venue_id"] || record["id"];
    if (!id) {
      warnings.push(`Row ${row}: missing venue_id; skipped.`);
      continue;
    }

    const update: VenueUpdate = { id };
    const address = record["address"];
    const city = record["city"];
    const state = record["state"];
    const zip = record["zip"];
    const venueUrl = record["venue_url"];
    const name = record["venue_name"];

    if (name) update.name = name;
    if (address) update.address = address;
    if (city) update.city = city;
    if (state) update.state = state.toUpperCase();
    if (zip) update.zip = zip;
    if (venueUrl) update.venue_url = venueUrl;

    // Skip rows that wouldn't change anything.
    const hasUpdates = Object.keys(update).length > 1;
    if (!hasUpdates) {
      warnings.push(`Row ${row}: no updatable fields present; skipped.`);
      continue;
    }

    updates.push(update);
  }

  return { updates, warnings };
}

async function run(filePath: string) {
  const records = loadCsv(filePath);
  const { updates, warnings } = buildUpdates(records);

  if (!updates.length) {
    console.error("No updates to apply.");
    warnings.forEach((w) => console.warn(w));
    process.exit(1);
  }

  console.log(`Applying ${updates.length} venue updates...`);

  const { error } = await supabase.from("venues").upsert(updates, { onConflict: "id" });
  if (error) {
    console.error("Upsert failed:", error.message);
    process.exit(1);
  }

  console.log("Done. Updated rows:", updates.length);
  warnings.forEach((w) => console.warn(w));
}

function main() {
  const fileArg = process.argv[2];
  if (!fileArg) usage(1);
  const filePath = path.resolve(process.cwd(), fileArg);
  run(filePath).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main();
