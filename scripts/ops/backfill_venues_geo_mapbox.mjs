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
    throttleMs: 350,
    onlyMissingBoth: false,
    country: "us",
    maxErrors: 25,
  };
  for (const raw of argv) {
    if (raw === "--apply") out.apply = true;
    else if (raw === "--dry-run") out.apply = false;
    else if (raw.startsWith("--limit=")) out.limit = Number(raw.split("=").slice(1).join("="));
    else if (raw.startsWith("--offset=")) out.offset = Number(raw.split("=").slice(1).join("="));
    else if (raw.startsWith("--throttle-ms=")) out.throttleMs = Number(raw.split("=").slice(1).join("="));
    else if (raw === "--only-missing-both") out.onlyMissingBoth = true;
    else if (raw.startsWith("--country=")) out.country = String(raw.split("=").slice(1).join("=")).trim() || "us";
    else if (raw.startsWith("--max-errors=")) out.maxErrors = Number(raw.split("=").slice(1).join("="));
    else if (raw === "--help" || raw === "-h") {
      console.log(`
Backfill missing venue latitude/longitude using Mapbox forward geocoding.

Usage:
  node scripts/ops/backfill_venues_geo_mapbox.mjs [--apply] [--limit=200] [--offset=0] [--throttle-ms=350]
       [--only-missing-both] [--country=us] [--max-errors=25]

Defaults to dry-run unless --apply is provided.

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
  if (!Number.isFinite(out.throttleMs) || out.throttleMs < 0) out.throttleMs = 0;
  if (!Number.isFinite(out.maxErrors) || out.maxErrors <= 0) out.maxErrors = 25;
  out.limit = Math.min(2000, Math.max(1, Math.floor(out.limit)));
  out.offset = Math.floor(out.offset);
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

function normalizeToken(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildQueryFromVenue(v) {
  const address = String(v.address ?? v.address1 ?? "").trim();
  const city = String(v.city ?? "").trim();
  const state = String(v.state ?? "").trim();
  const zip = String(v.zip ?? "").trim();

  const parts = [address, city, state, zip].filter(Boolean);
  if (parts.length >= 2) return parts.join(", ");

  // Fallback: try name + city/state (lower confidence).
  const name = String(v.name ?? "").trim();
  const parts2 = [name, city, state, zip].filter(Boolean);
  if (parts2.length >= 2) return parts2.join(", ");
  return null;
}

function parseInferredStateFromFeature(feature) {
  const ctx = Array.isArray(feature?.context) ? feature.context : [];
  const region = ctx.find((c) => String(c.id ?? "").startsWith("region.")) ?? null;
  const inferredState =
    String(region?.short_code ?? "")
      .toUpperCase()
      .split("-")
      .pop()
      ?.trim() || null;
  const place = ctx.find((c) => String(c.id ?? "").startsWith("place.")) ?? null;
  const inferredCity = String(place?.text ?? "").trim() || null;
  return { inferredState, inferredCity };
}

async function mapboxForwardGeocode(params) {
  const { token, query, country } = params;
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");
  url.searchParams.set("autocomplete", "false");
  url.searchParams.set("types", "address,poi,place");
  if (country) url.searchParams.set("country", country);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`mapbox_http_${res.status}`);
  const json = await res.json();
  const feature = Array.isArray(json?.features) ? json.features[0] : null;
  if (!feature) return null;
  const center = Array.isArray(feature?.center) ? feature.center : null;
  const lng = Number(center?.[0]);
  const lat = Number(center?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, place_name: String(feature.place_name ?? "").trim() || null, feature };
}

function shouldAcceptGeocode(params) {
  const { venue, geocode } = params;
  const expectedState = String(venue.state ?? "").trim().toUpperCase() || null;
  const expectedCity = String(venue.city ?? "").trim() || null;
  const inferred = parseInferredStateFromFeature(geocode.feature);

  // Basic sanity.
  if (Math.abs(geocode.lat) > 90 || Math.abs(geocode.lng) > 180) return { ok: false, reason: "coords_out_of_range" };
  if (Math.abs(geocode.lat) < 0.0001 && Math.abs(geocode.lng) < 0.0001) return { ok: false, reason: "coords_zero" };

  // Coarse US bbox if it looks like a US venue.
  if (isLikelyUsStateCode(expectedState)) {
    const usOk = geocode.lat >= 18 && geocode.lat <= 72 && geocode.lng >= -170 && geocode.lng <= -50;
    if (!usOk) return { ok: false, reason: "coords_outside_us_bbox" };
  }

  // Strong: state mismatch (only when both exist).
  if (expectedState && inferred.inferredState && expectedState !== inferred.inferredState) {
    return { ok: false, reason: `state_mismatch:${expectedState}!=${inferred.inferredState}` };
  }

  // Soft: city mismatch is fuzzy. If it looks totally different, we still accept but warn (printed).
  if (expectedCity && inferred.inferredCity) {
    const a = normalizeToken(expectedCity);
    const b = normalizeToken(inferred.inferredCity);
    const overlaps = a && b && (a.includes(b) || b.includes(a));
    if (!overlaps) return { ok: true, warn: `city_mismatch:${expectedCity}!=${inferred.inferredCity}` };
  }

  return { ok: true };
}

async function main() {
  // Load env vars without `source` (safer in CI/sandbox).
  const repoRoot = path.resolve(__dirname, "..", "..");
  loadEnvFileIfPresent(path.join(repoRoot, ".env"));
  loadEnvFileIfPresent(path.join(repoRoot, ".env.local"));

  const args = parseArgv(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mapboxToken = String(process.env.MAPBOX_ACCESS_TOKEN ?? "").trim();

  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  if (!mapboxToken) throw new Error("Missing MAPBOX_ACCESS_TOKEN");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? "apply" : "dry_run",
        limit: args.limit,
        offset: args.offset,
        throttle_ms: args.throttleMs,
        only_missing_both: args.onlyMissingBoth,
        country: args.country,
      },
      null,
      2
    )
  );

  // Pull a batch of candidates.
  let query = supabase
    .from("venues")
    .select("id,name,address,address1,city,state,zip,latitude,longitude,geocode_source,normalized_address,created_at")
    .order("created_at", { ascending: false })
    .range(args.offset, args.offset + args.limit - 1);

  query = args.onlyMissingBoth ? query.is("latitude", null).is("longitude", null) : query.or("latitude.is.null,longitude.is.null");

  const res = await query;
  if (res.error) throw res.error;
  const rows = res.data ?? [];

  let scanned = 0;
  let attempted = 0;
  let updated = 0;
  let skipped = 0;
  let warned = 0;
  let errors = 0;

  for (const v of rows) {
    scanned += 1;
    const hasLat = Number.isFinite(Number(v.latitude));
    const hasLng = Number.isFinite(Number(v.longitude));
    if (hasLat && hasLng) {
      skipped += 1;
      continue;
    }

    const q = buildQueryFromVenue(v);
    if (!q) {
      skipped += 1;
      continue;
    }

    attempted += 1;
    try {
      const geocode = await mapboxForwardGeocode({ token: mapboxToken, query: q, country: args.country });
      if (!geocode) {
        skipped += 1;
        continue;
      }

      const accept = shouldAcceptGeocode({ venue: v, geocode });
      if (!accept.ok) {
        skipped += 1;
        continue;
      }

      if (accept.warn) warned += 1;

      const patch = {
        latitude: geocode.lat,
        longitude: geocode.lng,
        geocode_source: "mapbox_forward_backfill_v1",
        normalized_address: geocode.place_name ?? v.normalized_address ?? null,
      };

      const label = `${String(v.name ?? v.id)} (${String(v.city ?? "").trim()}, ${String(v.state ?? "").trim()})`;
      const warnText = accept.warn ? ` warn=${accept.warn}` : "";

      if (!args.apply) {
        console.log(`[dry_run] ${v.id} ${label} -> ${geocode.lat.toFixed(6)},${geocode.lng.toFixed(6)}${warnText}`);
      } else {
        const upd = await supabase.from("venues").update(patch).eq("id", v.id);
        if (upd.error) throw upd.error;
        updated += 1;
        console.log(`[apply] ${v.id} ${label} -> ${geocode.lat.toFixed(6)},${geocode.lng.toFixed(6)}${warnText}`);
      }
    } catch (e) {
      errors += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[error] venue_id=${v.id} ${msg}`);
      if (errors >= args.maxErrors) {
        console.error(`[fatal] too many errors (${errors} >= ${args.maxErrors}), stopping early`);
        break;
      }
    }

    if (args.throttleMs) await sleep(args.throttleMs);
  }

  console.log(
    JSON.stringify(
      {
        scanned,
        attempted,
        updated,
        skipped,
        warned,
        errors,
        note: args.apply
          ? "Rows updated in Supabase."
          : "Dry-run only; rerun with --apply to write latitude/longitude.",
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("[backfill_venues_geo_mapbox] fatal", e);
  process.exit(1);
});

