import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { findNearestAirports } from "../../apps/referee/src/server/owlseye/airports/findNearestAirports";

const APPLY = process.argv.includes("--apply");
const ALL = process.argv.includes("--all");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 0;
const OFFSET_ARG = process.argv.find((arg) => arg.startsWith("--offset="));
const OFFSET = OFFSET_ARG ? Number(OFFSET_ARG.split("=")[1]) : 0;
const CHUNK = 200;

type OwlRunRow = {
  id: string;
  venue_id: string | null;
  outputs: Record<string, any> | null;
  status: string | null;
  created_at: string | null;
};

type VenueRow = {
  id: string;
  latitude: number | null;
  longitude: number | null;
};

function loadLocalEnv() {
  const envPath = path.resolve(".env.local");
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

async function main() {
  loadLocalEnv();
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const runRows: OwlRunRow[] = [];
  const latestByVenue = new Map<string, OwlRunRow>();
  for (let from = 0; ; from += CHUNK) {
    const to = from + CHUNK - 1;
    const { data, error } = await supabase
      .from("owls_eye_runs" as any)
      .select("id,venue_id,outputs,status,created_at")
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    const chunk = (data ?? []) as OwlRunRow[];
    runRows.push(...chunk);
    if (ALL) {
      for (const row of chunk) {
        if (!row.venue_id) continue;
        // Because we scan newest -> oldest, the first row we see per venue is the latest complete run.
        if (!latestByVenue.has(row.venue_id)) latestByVenue.set(row.venue_id, row);
      }
    }
    if (chunk.length < CHUNK) break;
  }

  const missingAirportRows = runRows.filter((row) => row.venue_id && !(row.outputs && row.outputs.airports));
  const allVenueLatestRows = Array.from(latestByVenue.values());

  const baseTargetRows = ALL ? allVenueLatestRows : missingAirportRows;
  const offsetRows = OFFSET > 0 ? baseTargetRows.slice(OFFSET) : baseTargetRows;
  const targetRows = LIMIT > 0 ? offsetRows.slice(0, LIMIT) : offsetRows;
  const venueIds = Array.from(new Set(targetRows.map((row) => row.venue_id).filter((value): value is string => Boolean(value))));

  const venueMap = new Map<string, VenueRow>();
  for (let i = 0; i < venueIds.length; i += CHUNK) {
    const chunkIds = venueIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("venues" as any)
      .select("id,latitude,longitude")
      .in("id", chunkIds);
    if (error) throw error;
    for (const venue of (data ?? []) as VenueRow[]) venueMap.set(venue.id, venue);
  }

  const updates: Array<{ id: string; outputs: Record<string, any> }> = [];
  let skippedMissingCoords = 0;

  for (const row of targetRows) {
    const venue = venueMap.get(row.venue_id as string);
    const lat = venue?.latitude;
    const lng = venue?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      skippedMissingCoords += 1;
      continue;
    }
    const airports = await findNearestAirports({ lat, lng });
    updates.push({
      id: row.id,
      outputs: {
        ...(row.outputs ?? {}),
        airports,
      },
    });
  }

  let updated = 0;
  if (APPLY) {
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      for (const row of chunk) {
        const { error } = await supabase.from("owls_eye_runs" as any).update({ outputs: row.outputs }).eq("id", row.id);
        if (error) throw error;
        updated += 1;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        all: ALL,
        offset: OFFSET,
        limit: LIMIT,
        complete_runs_scanned: runRows.length,
        runs_missing_airports: missingAirportRows.length,
        latest_complete_runs_by_venue: allVenueLatestRows.length,
        targeted_runs: targetRows.length,
        updates_prepared: updates.length,
        skipped_missing_coords: skippedMissingCoords,
        updated,
        sample: updates.slice(0, 5).map((row) => ({
          id: row.id,
          nearest_airport: row.outputs?.airports?.nearest_airport?.name ?? null,
          nearest_major_airport: row.outputs?.airports?.nearest_major_airport?.name ?? null,
        })),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[backfill-owls-eye-airports] fatal", error);
  process.exit(1);
});
