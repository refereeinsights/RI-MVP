import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function loadEnvFileIfPresent(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const kv = parseEnvLine(line);
      if (!kv) continue;
      if (process.env[kv.key] === undefined) process.env[kv.key] = kv.value;
    }
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") return;
    throw e;
  }
}

function parseArgv(argv) {
  const out = {
    limit: 2000,
    offset: 0,
    repeat: 0,
  };
  for (const raw of argv) {
    if (raw.startsWith("--limit=")) out.limit = Number(raw.split("=").slice(1).join("="));
    else if (raw.startsWith("--offset=")) out.offset = Number(raw.split("=").slice(1).join("="));
    else if (raw.startsWith("--repeat=")) out.repeat = Number(raw.split("=").slice(1).join("="));
    else if (raw === "--help" || raw === "-h") {
      console.log(`
Backfill tournament latitude/longitude from confirmed linked venues (primary preferred).

This calls the RPC:
  public.backfill_tournaments_geo_from_venues_v1(limit, offset)

Usage:
  node scripts/ops/backfill_tournaments_geo_from_venues.mjs [--limit=2000] [--offset=0] [--repeat=0]

If --repeat is set (e.g. 10), the script will call the RPC multiple times, advancing offset by limit.

Requires:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
`);
      process.exit(0);
    }
  }
  if (!Number.isFinite(out.limit) || out.limit <= 0) out.limit = 2000;
  if (!Number.isFinite(out.offset) || out.offset < 0) out.offset = 0;
  if (!Number.isFinite(out.repeat) || out.repeat < 0) out.repeat = 0;
  out.limit = Math.min(5000, Math.max(1, Math.floor(out.limit)));
  out.offset = Math.floor(out.offset);
  out.repeat = Math.floor(out.repeat);
  return out;
}

// Load env vars without `source` (safer in CI/sandbox).
const repoRoot = path.resolve(__dirname, "..", "..");
loadEnvFileIfPresent(path.join(repoRoot, ".env"));
loadEnvFileIfPresent(path.join(repoRoot, ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function runOnce(limit, offset) {
  const rpc = await supabase.rpc("backfill_tournaments_geo_from_venues_v1", { p_limit: limit, p_offset: offset });
  if (!rpc.error) {
    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    return row ?? null;
  }

  // Fallback: apply the deterministic backfill client-side.
  // This keeps ops unblocked if the RPC isn't deployed yet or fails due to a SQL bug.
  const errMsg = String(rpc.error?.message ?? "");
  console.warn(
    `[backfill_tournaments_geo_from_venues] rpc_failed code=${rpc.error?.code ?? "?"} msg=${errMsg}`
  );

  function chunkArray(list, size) {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  }

  const candidatesRes = await supabase
    .from("tournaments")
    .select("id", { count: "exact" })
    .or("latitude.is.null,longitude.is.null")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (candidatesRes.error) throw candidatesRes.error;

  const candidateIds = (candidatesRes.data ?? []).map((r) => r.id).filter(Boolean);
  const scanned = candidateIds.length;
  if (!candidateIds.length) return { scanned, updated: 0 };

  const bestByTournament = new Map();
  const idChunks = chunkArray(candidateIds, 200);
  for (const chunk of idChunks) {
    const linksRes = await supabase
      .from("tournament_venues")
      .select("tournament_id,is_primary,created_at,venues(latitude,longitude)")
      .in("tournament_id", chunk)
      .eq("is_inferred", false);
    if (linksRes.error) throw linksRes.error;

    for (const row of linksRes.data ?? []) {
      const tournamentId = row.tournament_id;
      const isPrimary = Boolean(row.is_primary);
      const createdAt = row.created_at ?? null;
      const lat = row?.venues?.latitude ?? null;
      const lng = row?.venues?.longitude ?? null;
      if (typeof lat !== "number" || typeof lng !== "number") continue;

      const existing = bestByTournament.get(tournamentId);
      if (!existing) {
        bestByTournament.set(tournamentId, { lat, lng, isPrimary, createdAt });
        continue;
      }

      const existingPrimary = Boolean(existing.isPrimary);
      if (isPrimary && !existingPrimary) {
        bestByTournament.set(tournamentId, { lat, lng, isPrimary, createdAt });
        continue;
      }
      if (isPrimary === existingPrimary) {
        const a = String(existing.createdAt ?? "9999-12-31T00:00:00Z");
        const b = String(createdAt ?? "9999-12-31T00:00:00Z");
        if (b < a) {
          bestByTournament.set(tournamentId, { lat, lng, isPrimary, createdAt });
        }
      }
    }
  }

  const nowIso = new Date().toISOString();
  const updates = Array.from(bestByTournament.entries()).map(([id, best]) => ({
    id,
    latitude: best.lat,
    longitude: best.lng,
    geo_source: best.isPrimary ? "primary_venue_backfill_v1" : "confirmed_venue_backfill_v1",
    geo_updated_at: nowIso,
  }));

  function isLikelyUsCoords(lat, lng) {
    return lat >= 18 && lat <= 72 && lng >= -170 && lng <= -50;
  }

  const filteredUpdates = updates.filter((u) => isLikelyUsCoords(u.latitude, u.longitude));
  if (!filteredUpdates.length) return { scanned, updated: 0 };

  // Update rows individually (avoids any accidental insert semantics from upsert).
  let updated = 0;
  for (const u of filteredUpdates) {
    const res = await supabase
      .from("tournaments")
      .update({
        latitude: u.latitude,
        longitude: u.longitude,
        geo_source: u.geo_source,
        geo_updated_at: u.geo_updated_at,
      })
      .eq("id", u.id)
      .or("latitude.is.null,longitude.is.null");
    if (res.error) throw res.error;
    updated += 1;
  }

  return { scanned, updated };
}

async function main() {
  const args = parseArgv(process.argv.slice(2));

  const iterations = args.repeat > 0 ? args.repeat : 1;
  for (let i = 0; i < iterations; i++) {
    const offset = args.offset + i * args.limit;
    const row = await runOnce(args.limit, offset);
    console.log(JSON.stringify({ limit: args.limit, offset, result: row }, null, 2));
    if (!row) continue;
    if (Number(row.scanned ?? 0) < args.limit) break;
    if (Number(row.updated ?? 0) === 0 && args.repeat === 0) break;
  }
}

main().catch((e) => {
  console.error("[backfill_tournaments_geo_from_venues] fatal", e);
  process.exit(1);
});
