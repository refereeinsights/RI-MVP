import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { upsertGearNearbyForRun } from "../../apps/referee/src/owlseye/nearby/upsertGearNearbyForRun";

dotenv.config({ path: ".env.local" });
dotenv.config();

function readArg(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

if (hasFlag("help") || hasFlag("h")) {
  console.log(
    [
      "Backfill Owl's Eye gear nearby (sporting_goods + big_box_fallback) for the latest run per venue.",
      "",
      "Dry-run (no writes):",
      "  npx tsx scripts/ops/backfill_owlseye_gear_nearby.ts --limit=200 --offset=0",
      "",
      "Apply writes:",
      "  npx tsx scripts/ops/backfill_owlseye_gear_nearby.ts --apply --limit=200 --offset=0",
      "",
      "Optional:",
      "  --force   refresh existing gear rows for a run (deletes only sporting_goods/big_box_fallback before insert)",
    ].join("\n")
  );
  process.exit(0);
}

const APPLY = hasFlag("apply");
const FORCE_REFRESH = hasFlag("force");
const LIMIT = (() => {
  const val = readArg("limit");
  if (!val) return 200;
  const num = Number(val);
  return Number.isFinite(num) ? Math.max(1, Math.floor(num)) : 200;
})();
const OFFSET = (() => {
  const val = readArg("offset");
  if (!val) return 0;
  const num = Number(val);
  return Number.isFinite(num) ? Math.max(0, Math.floor(num)) : 0;
})();

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

type RunRow = {
  id: string;
  run_id: string | null;
  venue_id: string | null;
  created_at: string | null;
  status: string | null;
};

type VenueRow = {
  id: string;
  latitude: number | null;
  longitude: number | null;
};

async function fetchAllLatestRunsByVenue(args: { supabase: any; pageSize?: number }) {
  const pageSize = Math.max(100, Math.min(5000, Math.floor(args.pageSize ?? 5000)));
  const latestByVenue = new Map<string, RunRow>();

  let offset = 0;
  for (;;) {
    const { data, error } = await args.supabase
      .from("owls_eye_runs")
      .select("id,run_id,venue_id,created_at,status")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;

    const rows = (data ?? []) as RunRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.venue_id) continue;
      if (latestByVenue.has(row.venue_id)) continue;
      latestByVenue.set(row.venue_id, row);
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return Array.from(latestByVenue.values());
}

async function fetchRunIdsWithGear(args: { supabase: any; runIds: string[] }) {
  const out = new Set<string>();
  const chunkSize = 200;
  for (let idx = 0; idx < args.runIds.length; idx += chunkSize) {
    const chunk = args.runIds.slice(idx, idx + chunkSize);
    const { data, error } = await args.supabase
      .from("owls_eye_nearby_food")
      .select("run_id,category")
      .in("run_id", chunk)
      .in("category", ["sporting_goods", "big_box_fallback"]);
    if (error) throw error;
    for (const row of (data ?? []) as any[]) {
      if (row?.run_id) out.add(String(row.run_id));
    }
  }
  return out;
}

async function fetchVenuesLatLng(args: { supabase: any; venueIds: string[] }) {
  const map = new Map<string, VenueRow>();
  const chunkSize = 200;
  for (let idx = 0; idx < args.venueIds.length; idx += chunkSize) {
    const chunk = args.venueIds.slice(idx, idx + chunkSize);
    const { data, error } = await args.supabase
      .from("venues")
      .select("id,latitude,longitude")
      .in("id", chunk);
    if (error) throw error;
    for (const row of (data ?? []) as VenueRow[]) {
      map.set(row.id, row);
    }
  }
  return map;
}

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const latestRuns = await fetchAllLatestRunsByVenue({ supabase });
  const runIds = latestRuns.map((row) => row.run_id ?? row.id);

  const runIdsWithGear = await fetchRunIdsWithGear({ supabase, runIds });
  const missing = latestRuns.filter((row) => !runIdsWithGear.has(row.run_id ?? row.id));

  const sliced = missing.slice(OFFSET, OFFSET + LIMIT);
  const venueIds = Array.from(new Set(sliced.map((row) => row.venue_id).filter(Boolean))) as string[];
  const venuesMap = await fetchVenuesLatLng({ supabase, venueIds });

  console.log(
    JSON.stringify(
      {
        totals: {
          venues_with_runs: latestRuns.length,
          latest_runs_checked: runIds.length,
          latest_runs_with_gear: runIdsWithGear.size,
          latest_runs_missing_gear: missing.length,
        },
        params: { apply: APPLY, force: FORCE_REFRESH, limit: LIMIT, offset: OFFSET, processing: sliced.length },
      },
      null,
      2
    )
  );

  let skippedNoCoords = 0;
  let inserted = 0;
  let noResults = 0;
  let failed = 0;

  for (const row of sliced) {
    const venueId = row.venue_id ?? "";
    const runId = row.run_id ?? row.id;
    const venue = venueId ? venuesMap.get(venueId) : null;
    const lat = venue?.latitude ?? null;
    const lng = venue?.longitude ?? null;
    if (typeof lat !== "number" || typeof lng !== "number" || !isFinite(lat) || !isFinite(lng)) {
      skippedNoCoords += 1;
      continue;
    }

    if (!APPLY) continue;

    try {
      const result = await upsertGearNearbyForRun({
        supabaseAdmin: supabase,
        runId,
        venueLat: lat,
        venueLng: lng,
        force: FORCE_REFRESH,
      });
      if (result.ok && result.message === "inserted") inserted += 1;
      else if (result.ok && result.message === "no_results") noResults += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        results: {
          skipped_no_coords: skippedNoCoords,
          inserted,
          no_results: noResults,
          failed,
        },
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
