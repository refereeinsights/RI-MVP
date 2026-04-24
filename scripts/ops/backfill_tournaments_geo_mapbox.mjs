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
    apply: false,
    limit: 200,
    offset: 0,
    repeat: 1,
    throttleMs: 350,
    onlyMissingBoth: true,
    country: "us",
    maxErrors: 25,
  };
  for (const raw of argv) {
    if (raw === "--apply") out.apply = true;
    else if (raw === "--dry-run") out.apply = false;
    else if (raw.startsWith("--limit=")) out.limit = Number(raw.split("=").slice(1).join("="));
    else if (raw.startsWith("--offset=")) out.offset = Number(raw.split("=").slice(1).join("="));
    else if (raw.startsWith("--repeat=")) out.repeat = Number(raw.split("=").slice(1).join("="));
    else if (raw.startsWith("--throttle-ms=")) out.throttleMs = Number(raw.split("=").slice(1).join("="));
    else if (raw === "--only-missing-both") out.onlyMissingBoth = true;
    else if (raw === "--missing-any") out.onlyMissingBoth = false;
    else if (raw.startsWith("--country=")) out.country = String(raw.split("=").slice(1).join("=")).trim() || "us";
    else if (raw.startsWith("--max-errors=")) out.maxErrors = Number(raw.split("=").slice(1).join("="));
    else if (raw === "--help" || raw === "-h") {
      console.log(`
Backfill missing tournament latitude/longitude using Mapbox forward geocoding.

Usage:
  node scripts/ops/backfill_tournaments_geo_mapbox.mjs [--apply] [--limit=200] [--offset=0] [--throttle-ms=350]
       [--only-missing-both|--missing-any] [--country=us] [--max-errors=25]

Defaults to dry-run unless --apply is provided.

Recommended workflow:
  1) Run backfill from venue links first:
     node scripts/ops/backfill_tournaments_geo_from_venues.mjs --repeat=20
  2) Then geocode remaining:
     node scripts/ops/backfill_tournaments_geo_mapbox.mjs --dry-run --limit=200
     node scripts/ops/backfill_tournaments_geo_mapbox.mjs --apply --limit=200

Requires:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  MAPBOX_ACCESS_TOKEN
`);
      process.exit(0);
    }
  }
  if (!Number.isFinite(out.limit) || out.limit <= 0) out.limit = 200;
  if (!Number.isFinite(out.offset) || out.offset < 0) out.offset = 0;
  if (!Number.isFinite(out.repeat) || out.repeat <= 0) out.repeat = 1;
  if (!Number.isFinite(out.throttleMs) || out.throttleMs < 0) out.throttleMs = 0;
  if (!Number.isFinite(out.maxErrors) || out.maxErrors <= 0) out.maxErrors = 25;
  out.limit = Math.min(2000, Math.max(1, Math.floor(out.limit)));
  out.offset = Math.floor(out.offset);
  out.repeat = Math.min(500, Math.floor(out.repeat));
  out.throttleMs = Math.floor(out.throttleMs);
  out.maxErrors = Math.floor(out.maxErrors);
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isLikelyUsStateCode(state) {
  const s = String(state ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s);
}

function buildQueryFromTournament(t) {
  const venue = String(t.venue ?? "").trim();
  const address = String(t.address ?? "").trim();
  const city = String(t.city ?? "").trim();
  const state = String(t.state ?? "").trim();
  const zip = String(t.zip ?? "").trim();

  const parts = [address, city, state, zip].filter(Boolean);
  if (parts.length >= 2) return parts.join(", ");

  const parts2 = [venue, city, state, zip].filter(Boolean);
  if (parts2.length >= 2) return parts2.join(", ");

  const parts3 = [t.name, city, state, zip].filter(Boolean);
  if (parts3.length >= 2) return parts3.join(", ");

  return null;
}

async function mapboxForwardGeocode({ token, query, country }) {
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");
  if (country) url.searchParams.set("country", country);

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "ri-mvp-tournaments-geo-backfill/1.0",
    },
  });
  if (!res.ok) throw new Error(`mapbox_http_${res.status}`);
  const json = await res.json();
  const feature = Array.isArray(json?.features) ? json.features[0] : null;
  const center = Array.isArray(feature?.center) ? feature.center : null;
  if (!feature || !center || center.length < 2) return null;
  const lng = Number(center[0]);
  const lat = Number(center[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, place_name: feature?.place_name ?? null, feature };
}

function parseInferredStateFromFeature(feature) {
  const ctx = Array.isArray(feature?.context) ? feature.context : [];
  for (const c of ctx) {
    const id = String(c?.id ?? "");
    if (!id.startsWith("region.")) continue;
    const shortCode = String(c?.short_code ?? "").trim().toUpperCase();
    if (shortCode.startsWith("US-")) return shortCode.slice(3);
  }
  return null;
}

function shouldAcceptGeocode({ tournament, geocode }) {
  if (Math.abs(geocode.lat) > 90 || Math.abs(geocode.lng) > 180) return { ok: false, reason: "coords_out_of_range" };
  if (Math.abs(geocode.lat) < 0.0001 && Math.abs(geocode.lng) < 0.0001) return { ok: false, reason: "coords_zero" };

  // Basic US bounding box sanity check (keeps out obvious global mismatches).
  const usOk = geocode.lat >= 18 && geocode.lat <= 72 && geocode.lng >= -170 && geocode.lng <= -50;
  if (!usOk) return { ok: false, reason: "coords_not_us" };

  const tournamentState = String(tournament.state ?? "").trim().toUpperCase();
  if (isLikelyUsStateCode(tournamentState)) {
    const inferred = parseInferredStateFromFeature(geocode.feature);
    if (inferred && inferred !== tournamentState) {
      return { ok: false, reason: `state_mismatch:${tournamentState}!=${inferred}` };
    }
  }

  return { ok: true, reason: null };
}

// Load env vars without `source` (safer in CI/sandbox).
const repoRoot = path.resolve(__dirname, "..", "..");
loadEnvFileIfPresent(path.join(repoRoot, ".env"));
loadEnvFileIfPresent(path.join(repoRoot, ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const mapboxToken = String(process.env.MAPBOX_ACCESS_TOKEN ?? "").trim();
if (!mapboxToken) throw new Error("Missing MAPBOX_ACCESS_TOKEN");

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function loadBatch(args) {
  const query = supabase
    .from("tournaments")
    .select("id,slug,name,venue,address,city,state,zip,latitude,longitude,geo_source,updated_at")
    // Use a stable ordering so pagination doesn't skip rows while we update geo fields.
    .order("id", { ascending: true })
    .range(args.offset, args.offset + args.limit - 1);

  if (args.onlyMissingBoth) query.is("latitude", null).is("longitude", null);
  else query.or("latitude.is.null,longitude.is.null");

  const res = await query;
  if (res.error) throw res.error;
  return res.data ?? [];
}

async function main() {
  const args = parseArgv(process.argv.slice(2));
  let totalErrors = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (let i = 0; i < args.repeat; i++) {
    const offset = args.offset + i * args.limit;
    const batch = await loadBatch({ ...args, offset });
    console.log(
      `[backfill_tournaments_geo_mapbox] loaded ${batch.length} tournaments (offset=${offset}, limit=${args.limit})`
    );
    if (!batch.length) break;

    for (const t of batch) {
      const label = `${t.slug ?? t.id} :: ${t.name ?? ""}`.trim();
      const q = buildQueryFromTournament(t);
      if (!q) {
        console.log(`[skip] ${label} missing_geocode_query`);
        totalSkipped += 1;
        continue;
      }

      let geocode = null;
      try {
        geocode = await mapboxForwardGeocode({ token: mapboxToken, query: q, country: args.country });
      } catch (e) {
        totalErrors += 1;
        console.warn(`[error] ${label} geocode_failed ${String(e?.message ?? e)}`);
        if (totalErrors >= args.maxErrors) throw new Error(`Too many errors (${totalErrors})`);
        await sleep(args.throttleMs);
        continue;
      }

      if (!geocode) {
        console.log(`[skip] ${label} no_results`);
        totalSkipped += 1;
        await sleep(args.throttleMs);
        continue;
      }

      const accept = shouldAcceptGeocode({ tournament: t, geocode });
      if (!accept.ok) {
        console.log(`[skip] ${label} reject=${accept.reason} -> ${geocode.lat.toFixed(6)},${geocode.lng.toFixed(6)}`);
        totalSkipped += 1;
        await sleep(args.throttleMs);
        continue;
      }

      if (!args.apply) {
        console.log(
          `[dry_run] ${label} -> ${geocode.lat.toFixed(6)},${geocode.lng.toFixed(6)} (${geocode.place_name ?? ""})`
        );
        totalUpdated += 1;
        await sleep(args.throttleMs);
        continue;
      }

      const res = await supabase
        .from("tournaments")
        .update({
          latitude: geocode.lat,
          longitude: geocode.lng,
          geo_source: "mapbox_forward_backfill_v1",
          geo_updated_at: new Date().toISOString(),
        })
        .eq("id", t.id)
        .or("latitude.is.null,longitude.is.null");
      if (res.error) {
        totalErrors += 1;
        console.warn(`[error] ${label} update_failed ${res.error.message}`);
        if (totalErrors >= args.maxErrors) throw new Error(`Too many errors (${totalErrors})`);
      } else {
        console.log(
          `[apply] ${label} -> ${geocode.lat.toFixed(6)},${geocode.lng.toFixed(6)} (${geocode.place_name ?? ""})`
        );
        totalUpdated += 1;
      }

      await sleep(args.throttleMs);
    }

    if (batch.length < args.limit) break;
  }

  console.log(JSON.stringify({ ok: true, updated: totalUpdated, skipped: totalSkipped, errors: totalErrors }, null, 2));
}

main().catch((e) => {
  console.error("[backfill_tournaments_geo_mapbox] fatal", e);
  process.exit(1);
});
