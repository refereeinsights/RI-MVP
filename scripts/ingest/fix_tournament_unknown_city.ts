/**
 * Backfill city on tournaments where city = 'Unknown' (literal string) but a linked
 * venue has a real city. Prefers non-inferred venue links. Does not touch status.
 *
 * Usage:
 *   npx tsx scripts/ingest/fix_tournament_unknown_city.ts          # dry-run
 *   npx tsx scripts/ingest/fix_tournament_unknown_city.ts --apply   # commit
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

  const { data: unknown, error: unknownErr } = await (sb
    .from("tournaments" as any)
    .select("id,name,slug,state,status")
    .ilike("city", "unknown")
    .limit(500) as any);
  if (unknownErr) { console.error(unknownErr.message); process.exit(1); }

  const ids = (unknown ?? []).map((t: any) => t.id);
  console.log(`Tournaments with city='Unknown': ${ids.length}`);

  const { data: links, error: linkErr } = await (sb
    .from("tournament_venues" as any)
    .select("tournament_id,venue_id,is_inferred")
    .in("tournament_id", ids)
    .limit(2000) as any);
  if (linkErr) { console.error(linkErr.message); process.exit(1); }

  // First venue per tournament — non-inferred wins
  const firstVenue = new Map<string, { venueId: string; inferred: boolean }>();
  for (const l of (links ?? []).sort((a: any, b: any) => Number(a.is_inferred) - Number(b.is_inferred))) {
    if (!firstVenue.has(l.tournament_id)) {
      firstVenue.set(l.tournament_id, { venueId: l.venue_id, inferred: l.is_inferred });
    }
  }

  const venueIds = Array.from(new Set(Array.from(firstVenue.values()).map((v) => v.venueId)));
  const { data: venues } = await (sb
    .from("venues" as any)
    .select("id,name,city,state")
    .in("id", venueIds)
    .limit(500) as any);
  const venueById = new Map((venues ?? []).map((v: any) => [v.id, v]));

  type Patch = { id: string; city: string; tournamentName: string; venueName: string };
  const patches: Patch[] = [];
  const skipped: string[] = [];

  for (const t of unknown ?? []) {
    const entry = firstVenue.get(t.id);
    if (!entry) { skipped.push(`${t.name ?? t.slug} — no venue link`); continue; }
    const v = venueById.get(entry.venueId);
    if (!v?.city || v.city.toLowerCase() === "unknown") {
      skipped.push(`${t.name ?? t.slug} — venue has no real city`);
      continue;
    }
    patches.push({ id: t.id, city: v.city, tournamentName: t.name ?? t.slug, venueName: v.name });
  }

  console.log(`\nPatches ready: ${patches.length}`);
  console.log(`Skipped: ${skipped.length}`);

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
