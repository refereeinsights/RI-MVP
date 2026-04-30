import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function parseDotenv(contents) {
  const out = {};
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const parsed = parseDotenv(fs.readFileSync(envPath, "utf8"));
  for (const [k, v] of Object.entries(parsed)) {
    if (!process.env[k] && typeof v === "string") process.env[k] = v;
  }
}

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function clean(value) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseCoordsFromMapsUrl(mapsUrlRaw) {
  const url = String(mapsUrlRaw ?? "").trim();
  if (!url) return null;

  // Common Google Maps patterns:
  // - .../@47.123,-122.456,17z
  // - ...?q=47.123,-122.456
  // - ...?query=47.123,-122.456
  // - ...?ll=47.123,-122.456
  const patterns = [
    /@(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /[?&](?:q|query|ll)=(-?\d{1,3}\.\d+)%2C(-?\d{1,3}\.\d+)/i,
    /[?&](?:q|query|ll)=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/i,
    /\/search\/\?api=1&query=(-?\d{1,3}\.\d+)%2C(-?\d{1,3}\.\d+)/i,
    /\/search\/\?api=1&query=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/i,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    return { lat, lng, source: "maps_url" };
  }
  return null;
}

function sanitizeAddressForGeocode(addressRaw) {
  let address = String(addressRaw ?? "").replace(/\s+/g, " ").trim();
  if (!address) return null;

  // Strip common non-address prefixes that cause Mapbox 422s (directions/notes).
  // Examples:
  // - "@ The Ritz off 22nd Street ..., 2201 Broadway St Suite 105, Paducah, KY 42001, USA"
  // - "Located next to ..., 3016 US-301 STE 100, Tampa, FL 33619, USA"
  address = address.replace(/^@\s*/g, "");
  address = address.replace(/^located\s+next\s+to\b[^,]*,\s*/i, "");
  address = address.replace(/^next\s+to\b[^,]*,\s*/i, "");
  address = address.replace(/^between\b[^,]*,\s*/i, "");
  address = address.replace(/^\bat\b[^,]*,\s*/i, "");
  address = address.replace(/^\bin\b[^,]*,\s*/i, "");

  // Remove parenthetical directions.
  address = address.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

  // If we have a street number, prefer starting from it (removes lingering lead-in text).
  const streetNumberMatch = address.match(/\b\d{1,6}\s+\S/);
  if (streetNumberMatch?.index != null && streetNumberMatch.index > 0) {
    address = address.slice(streetNumberMatch.index).trim();
  }

  // Collapse weird separators / duplicate punctuation.
  address = address
    .replace(/\s*,\s*/g, ", ")
    .replace(/,\s*,+/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!address) return null;

  // Keep queries reasonably short to avoid provider rejecting them (422).
  // Prefer the tail end (which usually contains the real address) if it's too long.
  const MAX_LEN = 220;
  if (address.length > MAX_LEN) {
    address = address.slice(address.length - MAX_LEN).trim();
    // If we cut mid-token, try to start from the next comma boundary.
    const comma = address.indexOf(", ");
    if (comma >= 0 && comma < 40) address = address.slice(comma + 2).trim();
  }

  return address || null;
}

function buildMapboxQuery(row, { simplify = false } = {}) {
  const raw = String(row.address ?? "").trim();
  if (!raw) return null;

  let cleaned = sanitizeAddressForGeocode(raw);
  if (!cleaned) return null;

  if (simplify) {
    // If we still have multiple comma-separated fragments (sometimes duplicated),
    // keep only the last 3–4 segments to bias toward city/state/zip tail.
    const parts = cleaned
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 4) cleaned = parts.slice(-4).join(", ");
  }

  // `owls_eye_nearby_food.address` is expected to include city/state/zip when available.
  // Keep country explicit so we don't geo-match Canada/etc for border towns.
  return `${cleaned}, United States`;
}

async function mapboxForwardGeocode({ query, token, proximity, country = "us" }) {
  const encoded = encodeURIComponent(query);
  const params = new URLSearchParams();
  params.set("access_token", token);
  params.set("limit", "1");
  params.set("country", country);
  if (proximity && Number.isFinite(proximity.lng) && Number.isFinite(proximity.lat)) {
    params.set("proximity", `${proximity.lng},${proximity.lat}`);
  }
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`mapbox_geocode_failed_${res.status}`);
    err.details = text.slice(0, 300);
    throw err;
  }
  const json = await res.json();
  const feature = Array.isArray(json?.features) ? json.features[0] : null;
  const center = Array.isArray(feature?.center) ? feature.center : null;
  if (!center || center.length < 2) return null;
  const lng = Number(center[0]);
  const lat = Number(center[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, source: "mapbox" };
}

function categoryNormalized(value) {
  const c = String(value ?? "").trim().toLowerCase();
  if (c === "hotel") return "hotels";
  return c;
}

function expandCategoriesForDb(categorySet) {
  // Some legacy rows use `category='hotel'` while newer UI/code tends to say `hotels`.
  // Keep both in the DB filter so default runs don't silently scan 0 rows.
  const out = new Set();
  for (const c of categorySet) {
    if (c === "hotels") {
      out.add("hotel");
      out.add("hotels");
      continue;
    }
    out.add(c);
  }
  return Array.from(out);
}

async function main() {
  loadEnvLocal();

  const APPLY = process.argv.includes("--apply");
  const DRY_RUN = process.argv.includes("--dry-run") || !APPLY;
  const LIMIT = Math.min(2000, Math.max(1, Number(argValue("limit") ?? 500) || 500));
  const OFFSET = Math.max(0, Number(argValue("offset") ?? 0) || 0);
  const THROTTLE_MS = Math.max(0, Number(argValue("throttle-ms") ?? 120) || 120);
  const MAX_CALLS = Math.min(20000, Math.max(1, Number(argValue("max-calls") ?? 20000) || 20000));
  const COUNTRY = clean(argValue("country")) || "us";

  const categoriesRaw = clean(argValue("categories")) || "hotels,coffee,quick_eats,hangouts";
  const categories = new Set(
    categoriesRaw
      .split(",")
      .map((c) => categoryNormalized(c))
      .filter(Boolean)
  );

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }
  const token = (process.env.MAPBOX_SECRET_TOKEN ?? process.env.MAPBOX_ACCESS_TOKEN ?? "").trim();
  if (!token) {
    throw new Error("Missing MAPBOX_SECRET_TOKEN or MAPBOX_ACCESS_TOKEN (needed for Mapbox geocoding)");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const OUT_PATH =
    clean(argValue("out")) || path.resolve(process.cwd(), "tmp", `backfill_owlseye_place_coords_${Date.now()}.csv`);
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUT_PATH,
    "row,id,run_id,category,provider,provider_place_id,place_id,name,address,distance_meters,source,lat,lng,action,note\n",
    "utf8"
  );

  // Fetch candidate rows (no coords) in priority categories.
  const catList = expandCategoriesForDb(categories);
  const { data: rows, error } = await supabase
    .from("owls_eye_nearby_food")
    .select("id,run_id,place_id,provider,provider_place_id,category,name,address,maps_url,distance_meters,place_latitude,place_longitude")
    .in("category", catList)
    .is("place_latitude", null)
    .is("place_longitude", null)
    .order("created_at", { ascending: false })
    .range(OFFSET, OFFSET + LIMIT - 1);
  if (error) throw error;

  const candidates = (rows ?? []).filter(Boolean);

  // Build proximity map by run_id -> venue coords (best-effort).
  const runIds = Array.from(new Set(candidates.map((r) => String(r.run_id ?? "")).filter(Boolean)));
  const runById = new Map();
  if (runIds.length) {
    for (let i = 0; i < runIds.length; i += 80) {
      const chunk = runIds.slice(i, i + 80);
      const resp = await supabase.from("owls_eye_runs").select("id,venue_id").in("id", chunk).limit(5000);
      if (!resp.error && Array.isArray(resp.data)) {
        for (const r of resp.data) runById.set(String(r.id), { venue_id: String(r.venue_id ?? "") || null });
      }
    }
  }
  const venueIds = Array.from(new Set(Array.from(runById.values()).map((r) => r.venue_id).filter(Boolean)));
  const venueById = new Map();
  if (venueIds.length) {
    for (let i = 0; i < venueIds.length; i += 80) {
      const chunk = venueIds.slice(i, i + 80);
      const resp = await supabase.from("venues").select("id,latitude,longitude").in("id", chunk).limit(5000);
      if (!resp.error && Array.isArray(resp.data)) {
        for (const v of resp.data) {
          const lat = typeof v.latitude === "number" ? v.latitude : Number(v.latitude ?? NaN);
          const lng = typeof v.longitude === "number" ? v.longitude : Number(v.longitude ?? NaN);
          venueById.set(String(v.id), {
            lat: Number.isFinite(lat) ? lat : null,
            lng: Number.isFinite(lng) ? lng : null,
          });
        }
      }
    }
  }

  const dedupeKeys = new Set();
  let scanned = 0;
  let updated = 0;
  let parsedFromMaps = 0;
  let geocoded = 0;
  let skippedDedupe = 0;
  let skippedNoQuery = 0;
  let errors = 0;
  let mapboxCalls = 0;

  for (const row of candidates) {
    scanned += 1;
    const id = String(row.id ?? "");
    const runId = String(row.run_id ?? "");
    const category = categoryNormalized(row.category);
    const provider = String(row.provider ?? "");
    const providerPlaceId = String(row.provider_place_id ?? "").trim() || null;
    const placeId = String(row.place_id ?? "");
    const name = String(row.name ?? "");
    const address = String(row.address ?? "");
    const distanceMeters = row.distance_meters ?? null;

    const dedupeKey = providerPlaceId ? `${provider}:${providerPlaceId}` : normalizeKey(`${name}|${address}`);
    if (dedupeKeys.has(dedupeKey)) {
      skippedDedupe += 1;
      fs.appendFileSync(
        OUT_PATH,
        [
          scanned,
          id,
          runId,
          category,
          provider,
          providerPlaceId ?? "",
          placeId,
          name,
          address,
          distanceMeters ?? "",
          "",
          "",
          "",
          DRY_RUN ? "skip" : "skip",
          "dedupe_key",
        ]
          .map((v) => {
            const s = String(v ?? "");
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",") + "\n"
      );
      continue;
    }
    dedupeKeys.add(dedupeKey);

    let coords = parseCoordsFromMapsUrl(row.maps_url);
    if (coords) {
      parsedFromMaps += 1;
    } else {
      const query = buildMapboxQuery(row, { simplify: false });
      if (!query) {
        skippedNoQuery += 1;
        fs.appendFileSync(
          OUT_PATH,
          [
            scanned,
            id,
            runId,
            category,
            provider,
            providerPlaceId ?? "",
            placeId,
            name,
            address,
            distanceMeters ?? "",
            "",
            "",
            "",
            "skip",
            "no_query",
          ]
            .map((v) => {
              const s = String(v ?? "");
              return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            })
            .join(",") + "\n"
        );
        continue;
      }

      const venueId = runById.get(runId)?.venue_id ?? null;
      const prox = venueId ? venueById.get(venueId) : null;
      const proximity = prox && prox.lat != null && prox.lng != null ? { lat: prox.lat, lng: prox.lng } : null;

      if (mapboxCalls >= MAX_CALLS) {
        fs.appendFileSync(
          OUT_PATH,
          [
            scanned,
            id,
            runId,
            category,
            provider,
            providerPlaceId ?? "",
            placeId,
            name,
            address,
            distanceMeters ?? "",
            "",
            "",
            "",
            "stop",
            "max_calls_reached",
          ]
            .map((v) => {
              const s = String(v ?? "");
              return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            })
            .join(",") + "\n"
        );
        break;
      }

      try {
        mapboxCalls += 1;
        coords = await mapboxForwardGeocode({ query, token, proximity, country: COUNTRY });
        if (coords) geocoded += 1;
      } catch (e) {
        const msg = String(e?.message ?? e ?? "geocode_error");
        let retried = false;

        // Mapbox sometimes rejects "dirty" address strings (422). Retry once with a simplified query.
        if (msg.includes("mapbox_geocode_failed_422")) {
          const simplified = buildMapboxQuery(row, { simplify: true });
          if (simplified && simplified !== query) {
            try {
              retried = true;
              if (mapboxCalls >= MAX_CALLS) throw new Error("max_calls_reached");
              mapboxCalls += 1;
              coords = await mapboxForwardGeocode({ query: simplified, token, proximity, country: COUNTRY });
              if (coords) geocoded += 1;
            } catch (e2) {
              errors += 1;
              const msg2 = String(e2?.message ?? e2 ?? "geocode_error");
              fs.appendFileSync(
                OUT_PATH,
                [
                  scanned,
                  id,
                  runId,
                  category,
                  provider,
                  providerPlaceId ?? "",
                  placeId,
                  name,
                  address,
                  distanceMeters ?? "",
                  "",
                  "",
                  "",
                  "error",
                  `${msg2.slice(0, 110)}${retried ? "|retry_simplified" : ""}`,
                ]
                  .map((v) => {
                    const s = String(v ?? "");
                    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                  })
                  .join(",") + "\n"
              );
              if (THROTTLE_MS) await sleep(THROTTLE_MS);
              continue;
            }
          }
        }

        if (!coords) {
          errors += 1;
          fs.appendFileSync(
            OUT_PATH,
            [
              scanned,
              id,
              runId,
              category,
              provider,
              providerPlaceId ?? "",
              placeId,
              name,
              address,
              distanceMeters ?? "",
              "",
              "",
              "",
              "error",
              `${msg.slice(0, 110)}${retried ? "|retry_simplified" : ""}`,
            ]
              .map((v) => {
                const s = String(v ?? "");
                return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
              })
              .join(",") + "\n"
          );
          if (THROTTLE_MS) await sleep(THROTTLE_MS);
          continue;
        }
      }

      if (THROTTLE_MS) await sleep(THROTTLE_MS);
    }

    if (!coords) continue;

    const updatePayload = { place_latitude: coords.lat, place_longitude: coords.lng };
    if (!DRY_RUN) {
      const resp = await supabase.from("owls_eye_nearby_food").update(updatePayload).eq("id", id);
      if (resp.error) {
        errors += 1;
        fs.appendFileSync(
          OUT_PATH,
          [
            scanned,
            id,
            runId,
            category,
            provider,
            providerPlaceId ?? "",
            placeId,
            name,
            address,
            distanceMeters ?? "",
            coords.source,
            coords.lat,
            coords.lng,
            "error",
            String(resp.error.message ?? "update_failed").slice(0, 120),
          ]
            .map((v) => {
              const s = String(v ?? "");
              return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            })
            .join(",") + "\n"
        );
        continue;
      }
    }

    updated += 1;
    fs.appendFileSync(
      OUT_PATH,
      [
        scanned,
        id,
        runId,
        category,
        provider,
        providerPlaceId ?? "",
        placeId,
        name,
        address,
        distanceMeters ?? "",
        coords.source,
        coords.lat,
        coords.lng,
        DRY_RUN ? "would_update" : "updated",
        "",
      ]
        .map((v) => {
          const s = String(v ?? "");
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",") + "\n"
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apply: APPLY,
        dry_run: DRY_RUN,
        categories: Array.from(categories),
        limit: LIMIT,
        offset: OFFSET,
        throttle_ms: THROTTLE_MS,
        max_calls: MAX_CALLS,
        out: OUT_PATH,
        scanned,
        updated,
        parsed_from_maps_url: parsedFromMaps,
        mapbox_calls: mapboxCalls,
        geocoded,
        skipped_dedupe: skippedDedupe,
        skipped_no_query: skippedNoQuery,
        errors,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("[backfill_owlseye_place_coords_mapbox] fatal", err);
  process.exit(1);
});
