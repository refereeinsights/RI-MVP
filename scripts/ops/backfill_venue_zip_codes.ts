#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Backfill / normalize `venues.zip` (US ZIP5) for TI.
 *
 * Strategy (in order):
 *  1) Normalize "bad" zips that contain a ZIP5 (e.g. "98057-1234" -> "98057")
 *  2) Extract ZIP5 from `address` if present
 *  3) Geocode missing ZIP via Nominatim (rate-limited)
 *
 * Default mode is DRY RUN: prints a CSV preview and summary only.
 * Use `--apply` to upsert updates into `public.venues`.
 *
 * Usage:
 *  NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/ops/backfill_venue_zip_codes.ts
 *  NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/ops/backfill_venue_zip_codes.ts --limit 200 --apply
 *
 * Notes:
 * - Nominatim usage policy requires a descriptive User-Agent and rate limiting.
 * - This script runs slowly when geocoding (1 request/sec by default).
 */

import process from "node:process";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type VenueZipUpdate = {
  id: string;
  zip: string;
  notes: string;
};

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeZipToZip5(input: string | null | undefined): string | null {
  const value = String(input ?? "").trim();
  if (!value) return null;
  const match = value.match(/\b(\d{5})\b/);
  return match?.[1] ?? null;
}

function isValidState2(state: string | null | undefined): boolean {
  const value = String(state ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(value);
}

function buildGeocodeQuery(venue: VenueRow): string | null {
  const address = String(venue.address ?? "").trim();
  const city = String(venue.city ?? "").trim();
  const state = String(venue.state ?? "").trim().toUpperCase();
  const name = String(venue.name ?? "").trim();

  const parts: string[] = [];
  if (address) parts.push(address);
  if (city) parts.push(city);
  if (isValidState2(state)) parts.push(state);
  if (!address && name) parts.unshift(name);
  if (!parts.length) return null;
  return parts.join(", ");
}

async function geocodeZip5ViaNominatim(query: string, userAgent: string): Promise<string | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");

  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as any;
  const item = Array.isArray(json) ? json[0] : null;
  const postcode = item?.address?.postcode ?? null;
  return normalizeZipToZip5(postcode);
}

function toCsvLine(values: string[]): string {
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

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const apply = hasFlag("--apply");
  const limitRaw = argValue("--limit");
  const limit = limitRaw ? Math.max(1, Math.min(5000, Number(limitRaw))) : 5000;
  const geocode = !hasFlag("--no-geocode");
  const perRequestMsRaw = argValue("--geocode-delay-ms");
  const geocodeDelayMs = perRequestMsRaw ? Math.max(300, Number(perRequestMsRaw)) : 1100;

  const userAgent =
    process.env.NOMINATIM_USER_AGENT ??
    "TournamentInsights/zip-backfill (contact: ops@tournamentinsights.com)";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const pageSize = 1000;
  const venues: VenueRow[] = [];
  for (let offset = 0; offset < limit; offset += pageSize) {
    const to = Math.min(limit - 1, offset + pageSize - 1);
    const { data, error } = await supabase.from("venues").select("id,name,address,city,state,zip").range(offset, to);
    if (error) {
      console.error("Failed to load venues:", error.message);
      process.exit(1);
    }
    const rows = (data ?? []) as VenueRow[];
    if (!rows.length) break;
    venues.push(...rows);
    if (rows.length < pageSize) break;
  }
  const candidates = venues.filter((v) => {
    const z = String(v.zip ?? "").trim();
    return !/^\d{5}$/.test(z);
  });

  const updates: VenueZipUpdate[] = [];
  const stats = {
    scanned: venues.length,
    candidates: candidates.length,
    normalized_existing: 0,
    extracted_from_address: 0,
    geocoded: 0,
    geocode_failed: 0,
    skipped_no_query: 0,
  };

  for (const venue of candidates) {
    const currentZip = String(venue.zip ?? "").trim();
    const normalizedExisting = normalizeZipToZip5(currentZip);
    if (normalizedExisting && normalizedExisting !== currentZip) {
      updates.push({ id: venue.id, zip: normalizedExisting, notes: "normalized_existing" });
      stats.normalized_existing += 1;
      continue;
    }

    const extractedFromAddress = normalizeZipToZip5(venue.address);
    if (extractedFromAddress) {
      updates.push({ id: venue.id, zip: extractedFromAddress, notes: "extracted_from_address" });
      stats.extracted_from_address += 1;
      continue;
    }

    if (!geocode) continue;

    const query = buildGeocodeQuery(venue);
    if (!query) {
      stats.skipped_no_query += 1;
      continue;
    }

    const zip5 = await geocodeZip5ViaNominatim(query, userAgent);
    if (zip5) {
      updates.push({ id: venue.id, zip: zip5, notes: "geocoded_nominatim" });
      stats.geocoded += 1;
    } else {
      stats.geocode_failed += 1;
    }

    await sleep(geocodeDelayMs);
  }

  console.log(toCsvLine(["venue_id", "zip", "notes"]));
  for (const u of updates) console.log(toCsvLine([u.id, u.zip, u.notes]));

  console.log("");
  console.log("Summary:", stats);
  console.log(`Updates ready: ${updates.length}${apply ? " (applying...)" : " (dry-run; use --apply to write)"}`);

  if (!apply) return;
  if (!updates.length) return;

  // Use UPDATEs rather than UPSERT to avoid accidental inserts if the conflict
  // target doesn't match the table's unique constraints in some environments.
  const failures: { id: string; error: string }[] = [];
  for (let i = 0; i < updates.length; i += 1) {
    const u = updates[i];
    const { error: updateError } = await supabase.from("venues").update({ zip: u.zip }).eq("id", u.id);
    if (updateError) {
      failures.push({ id: u.id, error: updateError.message });
      continue;
    }
    if ((i + 1) % 50 === 0) console.log(`Applied ${i + 1}/${updates.length}...`);
  }

  if (failures.length) {
    console.error(`Applied with ${failures.length} failures.`);
    failures.slice(0, 20).forEach((f) => console.error(`- ${f.id}: ${f.error}`));
    process.exit(1);
  }

  console.log("Applied updates:", updates.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
