/**
 * Backfill city on tournaments that have a linked venue but no city of their own.
 * State is already set on all affected rows; only city needs patching.
 *
 * Usage:
 *   npx tsx scripts/ingest/fix_tournament_missing_city.ts          # dry-run
 *   npx tsx scripts/ingest/fix_tournament_missing_city.ts --apply   # commit
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");

async function main() {
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. All tournaments missing city
  const { data: missing, error: missErr } = await (sb
    .from("tournaments" as any)
    .select("id,name,slug,state,status")
    .is("city", null)
    .limit(500) as any);
  if (missErr) { console.error(missErr.message); process.exit(1); }

  const ids = (missing ?? []).map((t: any) => t.id);
  console.log(`Tournaments missing city: ${ids.length}`);

  // 2. First non-inferred venue link per tournament
  const { data: links, error: linkErr } = await (sb
    .from("tournament_venues" as any)
    .select("tournament_id,venue_id")
    .in("tournament_id", ids)
    .eq("is_inferred", false)
    .limit(1000) as any);
  if (linkErr) { console.error(linkErr.message); process.exit(1); }

  const firstVenue = new Map<string, string>();
  for (const l of links ?? []) {
    if (!firstVenue.has(l.tournament_id)) firstVenue.set(l.tournament_id, l.venue_id);
  }

  // 3. Fetch venues
  const venueIds = Array.from(new Set(firstVenue.values()));
  const { data: venues } = await (sb
    .from("venues" as any)
    .select("id,name,city,state")
    .in("id", venueIds)
    .limit(500) as any);
  const venueById = new Map((venues ?? []).map((v: any) => [v.id, v]));

  // 4. Build patches
  type Patch = { id: string; city: string; tournamentName: string; venueName: string; venueCity: string };
  const patches: Patch[] = [];
  const skipped: string[] = [];

  for (const t of missing ?? []) {
    const venueId = firstVenue.get(t.id);
    if (!venueId) { skipped.push(`${t.name ?? t.slug} — no venue link`); continue; }
    const v = venueById.get(venueId);
    if (!v?.city) { skipped.push(`${t.name ?? t.slug} — venue has no city`); continue; }
    patches.push({ id: t.id, city: v.city, tournamentName: t.name ?? t.slug, venueName: v.name, venueCity: v.city });
  }

  console.log(`\nPatches ready: ${patches.length}`);
  console.log(`Skipped (no fix available): ${skipped.length}`);

  console.log("\nProposed changes:");
  for (const p of patches) {
    console.log(`  ${p.tournamentName} → city: ${p.city}  (from venue: ${p.venueName})`);
  }

  if (skipped.length) {
    console.log("\nSkipped:");
    for (const s of skipped) console.log(`  ${s}`);
  }

  if (!APPLY) {
    console.log("\nDry-run — pass --apply to commit.");
    return;
  }

  // 5. Apply
  let ok = 0, fail = 0;
  for (const p of patches) {
    const { error } = await (sb
      .from("tournaments" as any)
      .update({ city: p.city })
      .eq("id", p.id) as any);
    if (error) {
      console.error(`  FAIL ${p.tournamentName}: ${error.message}`);
      fail++;
    } else {
      console.log(`  OK  ${p.tournamentName} → ${p.city}`);
      ok++;
    }
  }

  console.log(`\nDone: ${ok} updated, ${fail} failed.`);
}

main().catch(console.error);
