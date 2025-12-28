import haversineMeters from "@/lib/geo/haversineMeters";
import fetchNearbyPlaces from "@/lib/google/nearbySearch";

type UpsertParams = {
  supabaseAdmin: any;
  runId: string;
  venueLat: number;
  venueLng: number;
  radiusMeters?: number;
  limitPerCategory?: number;
  force?: boolean;
};

const DEFAULT_RADIUS = 16093; // ~10 miles in meters
const DEFAULT_LIMIT = 8;

function mapsUrl(placeId: string) {
  return `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`;
}

type NearbyResult = {
  ok: boolean;
  message?: string;
  foodCount?: number;
  coffeeCount?: number;
};

export async function upsertNearbyForRun(params: UpsertParams): Promise<NearbyResult> {
  const {
    supabaseAdmin,
    runId,
    venueLat,
    venueLng,
    radiusMeters = DEFAULT_RADIUS,
    limitPerCategory = DEFAULT_LIMIT,
    force = false,
  } = params;

  if (!supabaseAdmin || !runId) return { ok: false, message: "missing_supabase_or_run" };

  if (!force) {
    const { count, error: countError } = await supabaseAdmin
      .from("owls_eye_nearby_food" as any)
      .select("run_id", { count: "exact", head: true })
      .eq("run_id", runId);
    if (!countError && (count ?? 0) > 0) {
      return { ok: true, message: "already_exists" };
    }
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn("[owlseye] Missing GOOGLE_PLACES_API_KEY; skipping nearby fetch");
    return { ok: false, message: "missing_api_key" };
  }

  const baseOpts = { lat: venueLat, lng: venueLng, radiusMeters, apiKey };
  let foodResults: any[] = [];
  let coffeeResults: any[] = [];
  try {
    [foodResults, coffeeResults] = await Promise.all([
      fetchNearbyPlaces({ ...baseOpts, type: "restaurant" }),
      fetchNearbyPlaces({ ...baseOpts, type: "cafe" }),
    ]);
  } catch (err) {
    console.error("[owlseye] Nearby fetch failed", err);
    return { ok: false, message: err instanceof Error ? err.message : "nearby_fetch_failed" };
  }

  const toRows = (items: any[], category: "food" | "coffee") =>
    items.slice(0, limitPerCategory).map((item) => ({
      run_id: runId,
      place_id: item.place_id,
      name: item.name,
      category,
      address: item.address ?? "",
      distance_meters: haversineMeters({ lat: venueLat, lng: venueLng }, { lat: item.lat, lng: item.lng }),
      maps_url: mapsUrl(item.place_id),
    }));

  const rows = [...toRows(foodResults, "food"), ...toRows(coffeeResults, "coffee")];
  if (rows.length === 0) {
    return { ok: true, message: "no_results", foodCount: foodResults.length, coffeeCount: coffeeResults.length };
  }

  const { error } = await supabaseAdmin.from("owls_eye_nearby_food" as any).upsert(rows, {
    onConflict: "run_id,place_id",
  });

  if (error) {
    console.error("[owlseye] Nearby upsert failed", error);
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message: "inserted",
    foodCount: Math.min(foodResults.length, limitPerCategory),
    coffeeCount: Math.min(coffeeResults.length, limitPerCategory),
  };
}

export default upsertNearbyForRun;
