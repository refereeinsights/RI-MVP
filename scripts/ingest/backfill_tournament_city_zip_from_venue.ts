#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Backfill missing city/zip on tournaments from their linked primary venue.
 *
 * Only fills fields that are NULL on the tournament and non-null on the venue.
 * Never overwrites existing tournament city/zip values.
 *
 * Usage:
 *   tsx scripts/ingest/backfill_tournament_city_zip_from_venue.ts [--dry-run]
 *
 * Flags:
 *   --dry-run   Print what would be updated without writing to the database.
 */

import process from "node:process";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type TournamentRow = { id: string; city: string | null; zip: string | null };
type VenueRow = { id: string; city: string | null; zip: string | null };
type TournamentVenueRow = { tournament_id: string; venue_id: string };
type TournamentUpdate = { id: string; city?: string; zip?: string };

async function fetchAll<T>(
  query: (offset: number, limit: number) => Promise<T[]>
): Promise<T[]> {
  const rows: T[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const batch = await query(offset, PAGE);
    rows.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

async function run() {
  if (DRY_RUN) console.log("DRY RUN — no writes will occur.\n");

  // 1. Fetch all published canonical tournaments missing city or zip
  console.log("Fetching tournaments missing city or zip...");
  const tournaments = await fetchAll<TournamentRow>(async (offset, limit) => {
    const { data, error } = await supabase
      .from("tournaments")
      .select("id, city, zip")
      .eq("status", "published")
      .eq("is_canonical", true)
      .or("city.is.null,zip.is.null")
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`tournaments fetch error: ${error.message}`);
    return data ?? [];
  });
  console.log(`  Found ${tournaments.length} tournaments.\n`);

  const tournamentMap = new Map(tournaments.map((t) => [t.id, t]));
  const tournamentIds = [...tournamentMap.keys()];

  // 2. Fetch all primary venue links and filter to relevant tournaments in memory
  // (avoids URL length limits from large .in() filters)
  console.log("Fetching primary venue links...");
  const allTvRows = await fetchAll<TournamentVenueRow>(async (offset, limit) => {
    const { data, error } = await supabase
      .from("tournament_venues")
      .select("tournament_id, venue_id")
      .eq("is_primary", true)
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`tournament_venues fetch error: ${error.message}`);
    return data ?? [];
  });
  const tournamentIdSet = new Set(tournamentIds);
  const tvRows = allTvRows.filter((r) => tournamentIdSet.has(r.tournament_id));

  const tvMap = new Map(tvRows.map((r) => [r.tournament_id, r.venue_id]));
  const venueIds = [...new Set(tvMap.values())];
  console.log(`  Found ${tvRows.length} links covering ${venueIds.length} unique venues.\n`);

  // 3. Fetch venues
  console.log("Fetching venue city/zip...");
  const venueMap = new Map<string, VenueRow>();
  const BATCH = 100;
  for (let i = 0; i < venueIds.length; i += BATCH) {
    const chunk = venueIds.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("venues")
      .select("id, city, zip")
      .in("id", chunk);
    if (error) throw new Error(`venues fetch error: ${error.message}`);
    for (const v of data ?? []) venueMap.set(v.id, v);
  }
  console.log(`  Fetched ${venueMap.size} venues.\n`);

  // 4. Build updates
  const updates: TournamentUpdate[] = [];

  for (const [tId, tournament] of tournamentMap) {
    const venueId = tvMap.get(tId);
    if (!venueId) continue;
    const venue = venueMap.get(venueId);
    if (!venue) continue;

    const update: TournamentUpdate = { id: tId };
    if (!tournament.city && venue.city) update.city = venue.city;
    if (!tournament.zip && venue.zip) update.zip = venue.zip;

    if (Object.keys(update).length > 1) updates.push(update);
  }

  console.log(`Updates to apply: ${updates.length}`);
  const cityFills = updates.filter((u) => u.city).length;
  const zipFills = updates.filter((u) => u.zip).length;
  console.log(`  Will fill city: ${cityFills}`);
  console.log(`  Will fill zip:  ${zipFills}\n`);

  if (!updates.length) {
    console.log("Nothing to update.");
    return;
  }

  if (DRY_RUN) {
    console.log("Sample (first 10):");
    for (const u of updates.slice(0, 10)) {
      console.log(`  ${u.id}  city=${u.city ?? "(unchanged)"}  zip=${u.zip ?? "(unchanged)"}`);
    }
    return;
  }

  // 5. Apply updates with concurrency (individual .update() per row to avoid
  //    upsert insert-path hitting not-null constraints on unrelated columns)
  console.log("Applying updates...");
  const CONCURRENCY = 20;
  let applied = 0;
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const chunk = updates.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async ({ id, ...fields }) => {
        const { error } = await supabase
          .from("tournaments")
          .update(fields)
          .eq("id", id);
        if (error) throw new Error(`update error for ${id}: ${error.message}`);
      })
    );
    applied += chunk.length;
    process.stdout.write(`\r  ${applied} / ${updates.length}`);
  }
  console.log("\nDone.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
