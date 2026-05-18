/**
 * Fix venues blocked from the Owl's Eye queue due to missing city.
 * All venues here have a full street address; city can be read directly from the address string.
 * Run dry-run first (default), then --apply to commit.
 *
 * Usage:
 *   npx tsx scripts/ingest/fix_venue_missing_city.ts           # dry run
 *   npx tsx scripts/ingest/fix_venue_missing_city.ts --apply   # write to DB
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const apply = process.argv.includes("--apply");

// Each entry: venue_id → fields to patch.
// City was parsed from the address field manually and verified against zip/state/coords.
const FIXES: Array<{ id: string; name: string; city: string; zip?: string }> = [
  // ── Folsom Lake Surf cluster (city missing; state=CA, zip=95630 correct) ──
  { id: "3892ce9b-9837-408d-80f4-378ffa46c655", name: "Theodore Judah Elementary",        city: "Folsom" },
  { id: "5f035488-0155-4b3f-bd0c-79f78583004c", name: "Russell Ranch Elementary",          city: "Folsom" },
  { id: "0a40ca19-27ff-442c-8c84-1ebb2822ae92", name: "Natoma Station Elementary",         city: "Folsom" },
  { id: "83a905dd-2136-47e6-8ac2-06beefa11214", name: "McFarland Park",                    city: "Folsom" },
  { id: "a74f8927-f64c-4734-9d9d-d0f945d285f2", name: "Handy Family Park",                 city: "Folsom" },
  { id: "4119aa45-01ae-46ab-bf35-d61e02349752", name: "Folsom Middle School",               city: "Folsom" },
  { id: "335fdd9b-fef9-4f06-bba2-d0b38e775af3", name: "Ed Mitchell Park",                  city: "Folsom" },
  { id: "89ca8fbe-3874-402a-9110-f9cfe64149a9", name: "Elvie Perazzo Briggs Park",          city: "Folsom" },
  { id: "0e4bab58-af24-41d3-8758-3fc58cde151e", name: "Sutter Middle School",               city: "Folsom" },
  { id: "4ea29460-1b1b-43d9-8545-bc062398ac13", name: "Gold Ridge Elementary",              city: "Folsom" },
  { id: "b87a2636-5e2a-472d-b656-79d68532f090", name: "Folsom Hills Elementary",            city: "Folsom" },
  { id: "9d39f9fd-8a7c-4470-9948-6f215e0de226", name: "Davies Park",                        city: "Folsom" },
  { id: "d464d689-bb7d-417c-96ee-7f59ba0190f5", name: "Lakeside Facility",                  city: "Folsom" },
  { id: "08b40d54-ca2e-4cd0-86ff-f6b7c9569c39", name: "Gallardo Elementary School",         city: "Folsom" },
  { id: "a912cdcc-6aa8-4886-b215-29b2685a4092", name: "Ernie Sheldon Park",                 city: "Folsom" },
  { id: "eddccb08-0374-43d2-99aa-356a137df117", name: "Cohn Park",                          city: "Folsom" },
  { id: "938a4c69-ee10-4d10-800d-71ff9df9ef6f", name: "Vista Del Lago High School Turf",    city: "Folsom" },
  { id: "4b6e0466-d71c-44eb-98d6-863eecdf4dc8", name: "Folsom Lake Surf Soccer Complex",    city: "Folsom" },
  // Rancho Cordova — same Folsom Lake Surf source, different city
  { id: "ee8d5ba3-f4f7-473d-a022-c752072b548d", name: "Stone Creek Soccer Complex",         city: "Rancho Cordova" },

  // ── Capital FC (duplicate records, same address, city in address string) ──
  { id: "9190dfab-da15-45bc-b618-17efb97de0ea", name: "Capital FC (record 1)",              city: "Salem" },
  { id: "7f18885b-71df-4c73-8dd4-49131a1ebd54", name: "Capital FC (record 2)",              city: "Salem" },

  // ── GA / IL venues — city embedded in address ──
  { id: "e4990b33-12de-45a9-add9-69f0298a43a7", name: "INDOOR FACILITIES",                  city: "Itasca" },
  { id: "9467c2ee-c527-4fa8-8011-50bde1002847", name: "Venue Locations: (Austell GA)",       city: "Austell" },
  { id: "6d59836c-1e4c-4f67-b0e5-a6675c3c0e1f", name: "Venue Locations: (Dallas GA)",        city: "Dallas" },
  { id: "ea4b5efa-38cd-4ea1-8be9-d00630674752", name: "Venue Locations: (Marietta GA)",       city: "Marietta" },
  { id: "798460b1-5ebd-4dd9-8463-7cd5027da211", name: "Soccer City Palatine",                city: "Palatine" },

  // ── TX venues ──
  // Katy Park: address is "24927 Morton Road, Houston, TX 77080" but zip field = "24927" (wrong).
  // Fix city + correct the zip.
  { id: "3362d6d4-3ec4-4a50-8296-1d326eddb924", name: "Katy Park",                          city: "Houston", zip: "77080" },

  // ── CA — Escondido ──
  // Address: "390 North Hidden Trails Rd Escondido, CA 92027" (no comma before city — still clear)
  { id: "0989baac-e6e6-4b1c-aa37-4ec486168c75", name: "Escondido Soccer Club – SDSC Surf Escondido", city: "Escondido" },
];

async function run() {
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(`Fixes to process: ${FIXES.length}\n`);

  // Verify all IDs exist first
  const ids = FIXES.map((f) => f.id);
  const { data: existing, error } = await supabase
    .from("venues" as any)
    .select("id,name,city,zip,address,address1")
    .in("id", ids);

  if (error) {
    console.error("Failed to verify venue IDs:", error.message);
    process.exit(1);
  }

  const foundIds = new Set((existing ?? []).map((r: any) => r.id));
  const missing = FIXES.filter((f) => !foundIds.has(f.id));
  if (missing.length > 0) {
    console.warn("WARNING — these IDs were not found in the DB:");
    missing.forEach((m) => console.warn(`  ${m.id} (${m.name})`));
  }

  const existingById = new Map((existing ?? []).map((r: any) => [r.id, r]));

  let willChange = 0;
  let alreadyCorrect = 0;

  for (const fix of FIXES) {
    const row = existingById.get(fix.id) as any;
    if (!row) continue;

    const patch: Record<string, string> = {};
    if (!row.city || row.city.trim() === "") patch.city = fix.city;
    if (fix.zip && (!row.zip || row.zip.trim() !== fix.zip)) patch.zip = fix.zip;

    if (Object.keys(patch).length === 0) {
      alreadyCorrect++;
      console.log(`  SKIP  ${row.name} — already has city="${row.city}"`);
      continue;
    }

    willChange++;
    const patchDesc = Object.entries(patch).map(([k, v]) => `${k}="${v}"`).join(", ");
    console.log(`  ${apply ? "PATCH" : "WOULD PATCH"}  ${row.name} → ${patchDesc}`);

    if (apply) {
      const { error: updateError } = await supabase
        .from("venues" as any)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", fix.id);
      if (updateError) {
        console.error(`    ERROR updating ${fix.id}:`, updateError.message);
      } else {
        console.log(`    ✓ updated`);
      }
    }
  }

  console.log(`\nSummary: ${willChange} to patch, ${alreadyCorrect} already correct, ${missing.length} not found`);
  if (!apply) console.log('\nRe-run with --apply to commit changes.');
}

run().catch((err) => { console.error(err); process.exit(1); });
