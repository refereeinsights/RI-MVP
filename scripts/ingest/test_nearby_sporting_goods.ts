/*
 * Evaluation script: find sporting goods / athletic stores within ~25 miles of venues.
 *
 * Prints results only; does NOT write to Supabase.
 *
 * Usage:
 *   npx tsx scripts/ingest/test_nearby_sporting_goods.ts
 *
 * Env:
 *   GOOGLE_PLACES_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   VENUE_SAMPLE_SIZE=20
 *   VENUE_POOL_SIZE=200
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import haversineMeters from "../../apps/referee/src/lib/geo/haversineMeters";

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string | null;
};

type PlaceHit = {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  miles: number;
  primaryType?: string;
  query: string;
};

const RADIUS_METERS = 40234; // ~25 miles (we also post-filter by distance because Places text search is a bias, not a hard cutoff)
const RADIUS_MILES = 25;
const MAX_RESULTS_PER_QUERY = 10;
const DEFAULT_POOL_SIZE = Number(process.env.VENUE_POOL_SIZE || "200");
const DEFAULT_SAMPLE_SIZE = Number(process.env.VENUE_SAMPLE_SIZE || "20");

const TEAM_STORE_TYPES = new Set([
  "sporting_goods_store",
  "sports_store",
  "outdoor_sports_store",
]);

// Exclusions: things we do NOT want to recommend as "get missing team sports gear".
// This is intentionally heuristic; we can refine as we see false positives.
const EXCLUDE_NAME_RE =
  /\b(gun|guns|firearm|firearms|ammo|ammunition|armory|arms|range|shoot|shooter|shooters|tactical|surplus)\b|\b(run|runner|running)\b|\b(racquet|racket|racquetball|tennis|pickleball)\b|\b(golf|pro\s*shop|tee\s*it\s*up)\b|\b(bike|bicycle|cycling)\b|\b(bowling)\b|\b(outdoors?|outfitter|ski|snowboard|boot\s*fitting)\b|\b(motorsports?|powersports?)\b|\b(bait|tackle|fishing|marine|boat)\b|\b(airsoft|paintball)\b|\b(lululemon)\b/i;

// "Good" stores for team-sports gear.
const CHAIN_ALLOW_RE =
  /\b(dick'?s\b|academy\s+sports|big\s*5|play\s+it\s+again\s+sports|dunham'?s|scheels|sports\s+basement)\b/i;
const TEAM_SPORT_ALLOW_RE = /\b(soccer|hockey|lacrosse|baseball|softball|basketball)\b/i;
const GENERIC_ALLOW_RE = /\b(sporting\s+goods|sports\s+equipment)\b/i;

// Big-box fallback when no sporting goods / team-gear store is found.
const FALLBACK_ALLOW_RE = /\b(target|walmart|wal-mart|sam'?s\s*club|costco|meijer|fred\s*meyer)\b/i;

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

function pickRandom<T>(items: T[], count: number) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

function milesFromMeters(m: number) {
  return m / 1609.344;
}

function getPlacesKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("Missing GOOGLE_PLACES_API_KEY");
  return key;
}

async function searchPlacesText(args: {
  lat: number;
  lng: number;
  query: string;
  radiusMeters: number;
  maxResultCount: number;
}): Promise<Array<{ place_id: string; name: string; address: string; lat: number; lng: number; primaryType?: string }>> {
  const endpoint = "https://places.googleapis.com/v1/places:searchText";
  const fieldMask = "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType";

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getPlacesKey(),
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify({
      textQuery: args.query,
      locationBias: {
        circle: {
          center: { latitude: args.lat, longitude: args.lng },
          radius: args.radiusMeters,
        },
      },
      maxResultCount: Math.max(1, Math.min(20, Math.floor(args.maxResultCount || 10))),
      rankPreference: "DISTANCE",
    }),
  });

  if (!resp.ok) {
    const msg = await resp.text();
    console.error("[sporting-goods-test] Places searchText HTTP", resp.status, msg.slice(0, 200));
    return [];
  }

  const json = (await resp.json()) as { places?: any[]; error?: { message?: string } };
  if (json.error?.message) {
    console.warn("[sporting-goods-test] Places searchText error", json.error.message);
  }

  return (json.places ?? [])
    .map((p) => {
      const placeId = p.id || (p.name ? String(p.name).split("/").pop() : null);
      const name = p.displayName?.text ? String(p.displayName.text) : null;
      const address = p.formattedAddress ? String(p.formattedAddress) : null;
      const latVal = p.location?.latitude;
      const lngVal = p.location?.longitude;
      if (!placeId || !name || !address || typeof latVal !== "number" || typeof lngVal !== "number") return null;
      return {
        place_id: placeId,
        name,
        address,
        lat: latVal,
        lng: lngVal,
        primaryType: typeof p.primaryType === "string" ? p.primaryType : undefined,
      };
    })
    .filter(Boolean) as Array<{ place_id: string; name: string; address: string; lat: number; lng: number; primaryType?: string }>;
}

async function main() {
  loadLocalEnv();
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("venues" as any)
    .select("id,name,address,city,state,zip,latitude,longitude,created_at")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("created_at", { ascending: false })
    .limit(DEFAULT_POOL_SIZE);

  if (error) throw error;

  const pool = ((data ?? []) as VenueRow[]).filter((row) => {
    if (typeof row.latitude !== "number" || typeof row.longitude !== "number") return false;
    if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) return false;
    const st = (row.state ?? "").trim();
    return st.length === 2;
  });

  const venues = pickRandom(pool, DEFAULT_SAMPLE_SIZE);
  const queries = ["sporting goods store", "sports equipment store", "soccer store", "hockey shop"];
  const fallbackQueries = ["Target", "Walmart", "Walmart Supercenter", "Target store"];

  const results: Array<{ venue: VenueRow; hits: PlaceHit[] }> = [];
  const isRelevant = (hit: PlaceHit) => {
    const name = (hit.name ?? "").trim();
    if (!name) return false;
    if (EXCLUDE_NAME_RE.test(name)) return false;
    if (CHAIN_ALLOW_RE.test(name)) return true;
    if (TEAM_SPORT_ALLOW_RE.test(name)) return true;
    const t = (hit.primaryType ?? "").trim();
    if (!TEAM_STORE_TYPES.has(t)) return false;
    return GENERIC_ALLOW_RE.test(name);
  };
  const isFallback = (hit: PlaceHit) => {
    const name = (hit.name ?? "").trim();
    if (!name) return false;
    if (EXCLUDE_NAME_RE.test(name)) return false;
    return FALLBACK_ALLOW_RE.test(name);
  };
  let venuesWithRelevant = 0;
  let totalRelevantHits = 0;

  for (const venue of venues) {
    const lat = venue.latitude as number;
    const lng = venue.longitude as number;
    const seen = new Set<string>();
    const hits: PlaceHit[] = [];

    for (const q of queries) {
      const places = await searchPlacesText({
        lat,
        lng,
        query: q,
        radiusMeters: RADIUS_METERS,
        maxResultCount: MAX_RESULTS_PER_QUERY,
      });

      for (const place of places) {
        if (seen.has(place.place_id)) continue;
        const meters = haversineMeters({ lat, lng }, { lat: place.lat, lng: place.lng });
        const miles = milesFromMeters(meters);
        if (miles > RADIUS_MILES) continue;
        seen.add(place.place_id);
        hits.push({
          place_id: place.place_id,
          name: place.name,
          address: place.address,
          lat: place.lat,
          lng: place.lng,
          miles: Number(miles.toFixed(1)),
          primaryType: place.primaryType,
          query: q,
        });
      }
    }

    // If we didn't find any team-gear store, try big-box fallbacks (Target/Walmart/etc).
    if (hits.filter(isRelevant).length === 0) {
      for (const q of fallbackQueries) {
        const places = await searchPlacesText({
          lat,
          lng,
          query: q,
          radiusMeters: RADIUS_METERS,
          maxResultCount: MAX_RESULTS_PER_QUERY,
        });

        for (const place of places) {
          if (seen.has(place.place_id)) continue;
          const meters = haversineMeters({ lat, lng }, { lat: place.lat, lng: place.lng });
          const miles = milesFromMeters(meters);
          if (miles > RADIUS_MILES) continue;
          seen.add(place.place_id);
          hits.push({
            place_id: place.place_id,
            name: place.name,
            address: place.address,
            lat: place.lat,
            lng: place.lng,
            miles: Number(miles.toFixed(1)),
            primaryType: place.primaryType,
            query: q,
          });
        }
      }
    }

    hits.sort((a, b) => a.miles - b.miles);
    // Keep a bit more than we display so the "relevant vs fallback" selection has room.
    results.push({ venue, hits: hits.slice(0, 25) });
  }

  for (const row of results) {
    const v = row.venue;
    const venueLabel = [v.name || "(unnamed venue)", v.city, v.state].filter(Boolean).join(" - ");
    const addr = [v.address, v.city, v.state, v.zip].filter(Boolean).join(", ");

    console.log("");
    console.log(`VENUE: ${venueLabel}`);
    console.log(`  id: ${v.id}`);
    console.log(`  address: ${addr}`);

    const relevantHits = row.hits.filter(isRelevant);
    const fallbackHits = row.hits.filter(isFallback);
    if (relevantHits.length > 0) {
      venuesWithRelevant += 1;
      totalRelevantHits += relevantHits.length;
    } else if (fallbackHits.length > 0) {
      venuesWithRelevant += 1;
      totalRelevantHits += fallbackHits.length;
    }

    if (row.hits.length === 0) {
      console.log("  stores: (none found within ~25 mi)");
      continue;
    }

    const displayHits =
      relevantHits.length > 0 ? relevantHits : fallbackHits.length > 0 ? fallbackHits : row.hits;
    const label =
      relevantHits.length > 0
        ? "relevant stores"
        : fallbackHits.length > 0
        ? "fallback stores (Target/Walmart/etc)"
        : "stores (unfiltered; noisy)";

    console.log(`  ${label} (top ${displayHits.length}):`);
    for (const hit of displayHits) {
      const typeLabel = hit.primaryType ? ` [${hit.primaryType}]` : "";
      console.log(`    - ${hit.name}${typeLabel} - ${hit.miles} mi`);
      console.log(`      ${hit.address}`);
    }
  }

  console.log("");
  console.log(
    `Summary: sampled ${venues.length} venues from pool=${pool.length} (queried ${DEFAULT_POOL_SIZE}); radius ~25 miles; queries=${queries.join(", ")}`
  );
  console.log(
    `Coverage: ${venuesWithRelevant}/${venues.length} venues had >=1 team-gear store hit, or a big-box fallback (Target/Walmart/etc). Total hits shown across venues: ${totalRelevantHits}.`
  );
}

main().catch((err) => {
  console.error("[sporting-goods-test] fatal", err);
  process.exit(1);
});
