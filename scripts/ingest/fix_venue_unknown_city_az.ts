/**
 * Patch city (and where needed state) on AZ/CA venues that have city='Unknown'
 * but whose correct city is derivable from the venue name, address field, or
 * tournament context.
 *
 * State-mismatch venues (CA venue linked to AZ-tagged tournament) are patched
 * for venue data quality but flagged — the tournament state needs separate review.
 *
 * Usage:
 *   npx tsx scripts/ingest/fix_venue_unknown_city_az.ts          # dry-run
 *   npx tsx scripts/ingest/fix_venue_unknown_city_az.ts --apply   # commit
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");

type VenuePatch = {
  id: string;
  name: string;
  city: string;
  state?: string;
  note: string;
  stateMismatch?: boolean;
};

const PATCHES: VenuePatch[] = [
  // Street address in Surprise AZ — blocks 11 tournaments
  {
    id: "03a84a63-8d0b-4a1b-a418-9ebd43cb5d43",
    name: "15086 W. Baden St.",
    city: "Surprise",
    state: "AZ",
    note: "Street address is in Surprise AZ 85374",
  },
  // Arizona Athletic Grounds — addr field says 'Mesa, AZ', city=Unknown
  {
    id: "49d3bb50-30c0-46eb-a558-5b92825e9c0c",
    name: "Arizona Athletic Grounds",
    city: "Mesa",
    state: "AZ",
    note: "addr field contains 'Mesa, AZ'",
  },
  // Grand Canyon University — Phoenix AZ
  {
    id: "a1df994b-ba1c-4976-be7f-2077fb52e682",
    name: "Grand Canyon University",
    city: "Phoenix",
    state: "AZ",
    note: "Well-known university at 3300 W Camelback Rd, Phoenix AZ",
  },
  // Joseph City High School — Joseph City AZ
  {
    id: "eb720299-2f48-4a41-a48d-e2e7ff18bea8",
    name: "Joseph City High School",
    city: "Joseph City",
    state: "AZ",
    note: "School name contains city name; Joseph City AZ",
  },
  // Douglas High School — Douglas AZ
  {
    id: "3e2ecc68-51b2-436b-b79f-0b23c878a163",
    name: "Douglas High School",
    city: "Douglas",
    state: "AZ",
    note: "School name contains city name; Douglas AZ",
  },
  // Centennial Park (AZ) — Kingman AZ per tournament name "Kingman Softball Invitational"
  {
    id: "f89826b2-8efe-46a4-9c0f-bae8da7e3b8f",
    name: "Centennial Park",
    city: "Kingman",
    state: "AZ",
    note: "Inferred from linked tournament '3rd Annual Danny Gonzalez Kingman Softball Invitational'",
  },
  // Payson High School; Rumsey Park — Payson AZ
  {
    id: "b7ef9270-3172-4147-b3d9-1d840bd1fc83",
    name: "Payson High School; Rumsey Park",
    city: "Payson",
    state: "AZ",
    note: "Payson HS and Rumsey Park are both in Payson AZ",
  },
  // Multi-venue combos — all Mesa AZ (Frontier Family Park anchor)
  {
    id: "c61fd838-1ba6-4b49-ad64-c219a84f18a8",
    name: "Frontier Family Park; Arizona Athletic Grounds",
    city: "Mesa",
    state: "AZ",
    note: "Frontier Family Park is in Mesa AZ",
  },
  {
    id: "e0f8121a-2494-4b1d-9a0f-a3f41f49ec5b",
    name: "Frontier Family Park; Christopher J. Brady",
    city: "Mesa",
    state: "AZ",
    note: "Frontier Family Park is in Mesa AZ",
  },
  // Christopher J. Brady + Papago Park — Phoenix AZ
  {
    id: "5e4d40f5-ef1d-4fea-8242-303e3918f88f",
    name: "Christopher J. Brady; Papago Park",
    city: "Phoenix",
    state: "AZ",
    note: "Papago Park is in Phoenix AZ",
  },
  // Rose Mofford / Thunderbird HS / Papago Softball — Phoenix AZ
  {
    id: "e4f073e4-8a06-4654-902d-f87c74d09205",
    name: "Rose Mofford Complex; Thunderbird High School; Papago Softball Complex",
    city: "Phoenix",
    state: "AZ",
    note: "Rose Mofford Complex is in Phoenix AZ",
  },
  // Ben Franklin HS / Crismon HS — Mesa AZ
  {
    id: "10675389-6b50-4e33-8bf8-91180dbb76b3",
    name: "Benjamin Franklin High School; Crismon High School",
    city: "Mesa",
    state: "AZ",
    note: "Benjamin Franklin HS is in Mesa AZ; Crismon HS is in Queen Creek AZ — using Mesa as primary",
  },
  // CA venues — fix venue data quality; tournament state mismatch flagged separately
  {
    id: "26590d2b-649f-4331-9cd9-a56d33afe900",
    name: "Riverview Sports Park",
    city: "Truckee",
    state: "CA",
    note: "addr field contains 'Truckee, CA' — STATE MISMATCH: linked tournament tagged AZ",
    stateMismatch: true,
  },
  {
    id: "dc124d99-a5f8-4a0c-ac9d-dd9109afb805",
    name: "San Clemente High School",
    city: "San Clemente",
    state: "CA",
    note: "addr field contains 'San Clemente, CA' — STATE MISMATCH: linked tournament tagged AZ",
    stateMismatch: true,
  },
];

async function main() {
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log(`Venue patches: ${PATCHES.length}\n`);

  const normal = PATCHES.filter((p) => !p.stateMismatch);
  const mismatched = PATCHES.filter((p) => p.stateMismatch);

  console.log("High-confidence patches:");
  for (const p of normal) {
    console.log(`  ${p.name} → ${p.city}, ${p.state ?? "—"}  (${p.note})`);
  }

  console.log("\nState-mismatch patches (venue fixed, tournament state needs manual review):");
  for (const p of mismatched) {
    console.log(`  ${p.name} → ${p.city}, ${p.state}  (${p.note})`);
  }

  if (!APPLY) {
    console.log("\nDry-run — pass --apply to commit.");
    return;
  }

  let ok = 0, fail = 0;
  for (const p of PATCHES) {
    const update: Record<string, string> = { city: p.city };
    if (p.state) update.state = p.state;
    const { error } = await (sb
      .from("venues" as any)
      .update(update)
      .eq("id", p.id) as any);
    if (error) {
      console.error(`  FAIL ${p.name}: ${error.message}`);
      fail++;
    } else {
      const tag = p.stateMismatch ? " ⚠ state mismatch" : "";
      console.log(`  OK  ${p.name} → ${p.city}, ${p.state}${tag}`);
      ok++;
    }
  }

  console.log(`\nDone: ${ok} updated, ${fail} failed.`);
  console.log("\n⚠ Manual follow-up needed:");
  console.log("  - Copa De Las Sierras (tournament state=AZ, venue Riverview Sports Park is Truckee CA)");
  console.log("  - Swallows Cup 2026 (tournament state=AZ, venue San Clemente High School is San Clemente CA)");
  console.log("  - Sunset Park (AZ, Unknown) — ambiguous, needs manual city lookup");
}

main().catch(console.error);
