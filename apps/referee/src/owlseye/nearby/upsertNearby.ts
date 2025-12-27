import haversineMeters from "../../lib/haversineMeters";
import fetchNearbyPlaces from "../../lib/google/nearbyPlaces";

type UpsertParams = {
  supabaseAdmin: any;
  runId: string;
  venueLat: number;
  venueLng: number;
  radiusMeters?: number;
  force?: boolean;
};

const DEFAULT_RADIUS = 2500;
const MAX_RESULTS = 8;

function mapsUrl(placeId: string) {
  return `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`;
}

export async function upsertNearbyForRun(params: UpsertParams): Promise<void> {
  const { supabaseAdmin, runId, venueLat, venueLng, radiusMeters = DEFAULT_RADIUS, force = false } = params;
  if (!supabaseAdmin || !runId) return;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("owls_eye_nearby_food" as any)
    .select("run_id")
    .eq("run_id", runId)
    .limit(1);

  if (!force && existingError == null && Array.isArray(existing) && existing.length > 0) {
    return;
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn("[owlseye] Missing GOOGLE_PLACES_API_KEY; skipping nearby fetch");
    return;
  }

  const baseOpts = { lat: venueLat, lng: venueLng, radiusMeters, apiKey };

  const [foodResults, coffeeResults] = await Promise.all([
    fetchNearbyPlaces({ ...baseOpts, type: "restaurant" }),
    fetchNearbyPlaces({ ...baseOpts, type: "cafe" }),
  ]);

  const toRows = (items: any[], category: "food" | "coffee") =>
    items.slice(0, MAX_RESULTS).map((item) => ({
      run_id: runId,
      place_id: item.place_id,
      name: item.name,
      category,
      address: item.address ?? null,
      distance_meters: haversineMeters({ lat: venueLat, lng: venueLng }, { lat: item.lat, lng: item.lng }),
      maps_url: mapsUrl(item.place_id),
    }));

  const rows = [...toRows(foodResults, "food"), ...toRows(coffeeResults, "coffee")];
  if (rows.length === 0) return;

  const { error } = await supabaseAdmin.from("owls_eye_nearby_food" as any).upsert(rows, {
    onConflict: "run_id,place_id",
  });

  if (error) {
    console.error("[owlseye] Nearby upsert failed", error);
  }
}

export default upsertNearbyForRun;
