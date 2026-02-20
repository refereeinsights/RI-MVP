import haversineMeters from "@/lib/geo/haversineMeters";
import fetchNearbyPlaces from "@/lib/google/nearbySearch";

type UpsertParams = {
  supabaseAdmin: any;
  runId: string;
  venueId?: string;
  sport?: "soccer" | "basketball";
  venueLat: number;
  venueLng: number;
  radiusMeters?: number;
  limitPerCategory?: number;
  force?: boolean;
};

const DEFAULT_RADIUS = 16093; // ~10 miles in meters
const HOTEL_RADIUS = 32187; // ~20 miles in meters
const DEFAULT_LIMIT = 8;
const HOTEL_INCLUDE_RE = /\b(hotel|motel|inn|resort|suite|suites|lodge)\b/i;
const HOTEL_EXCLUDE_RE =
  /\b(storage|self storage|mobile home|rv|campground|trailer|home park|apartment|condo|residential|retreat|getaway|holiday home)\b/i;

function mapsUrl(placeId: string) {
  return `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`;
}

function buildSponsorRow(runId: string) {
  const name = process.env.OWLSEYE_SPONSOR_NAME;
  const address = process.env.OWLSEYE_SPONSOR_ADDRESS;
  const clickUrl = process.env.OWLSEYE_SPONSOR_CLICK_URL;
  if (!name) return null;
  const placeId = `sponsor-${runId}`;
  return {
    run_id: runId,
    place_id: placeId,
    name,
    category: "food" as const, // will be preserved as sponsor
    address: address ?? "",
    distance_meters: 0,
    maps_url: clickUrl ?? undefined,
    is_sponsor: true,
  };
}

type NearbyResult = {
  ok: boolean;
  message?: string;
  foodCount?: number;
  coffeeCount?: number;
  hotelCount?: number;
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
  let hotelResults: any[] = [];
  try {
    [foodResults, coffeeResults, hotelResults] = await Promise.all([
      fetchNearbyPlaces({ ...baseOpts, type: "restaurant" }),
      fetchNearbyPlaces({ ...baseOpts, type: "cafe" }),
      fetchNearbyPlaces({ ...baseOpts, type: "lodging", radiusMeters: HOTEL_RADIUS }),
    ]);
  } catch (err) {
    console.error("[owlseye] Nearby fetch failed", err);
    return { ok: false, message: err instanceof Error ? err.message : "nearby_fetch_failed" };
  }

  const classifyCategory = (name: string, fallback: "food" | "coffee" | "hotel"): "food" | "coffee" | "hotel" => {
    const lower = (name || "").toLowerCase();
    if (lower.includes("coffee") || lower.includes("espresso") || lower.includes("cafe") || lower.includes("café")) {
      return "coffee";
    }
    if (
      lower.includes("hotel") ||
      lower.includes("inn") ||
      lower.includes("resort") ||
      lower.includes("suites") ||
      lower.includes("lodge")
    ) {
      return "hotel";
    }
    return fallback;
  };

  const isHotelLike = (item: any) => {
    const name = String(item?.name ?? "");
    const address = String(item?.address ?? "");
    const haystack = `${name} ${address}`.toLowerCase();
    const types = Array.isArray(item?.types)
      ? item.types.map((t: unknown) => String(t).toLowerCase())
      : [];
    const primaryType = String(item?.primaryType ?? "").toLowerCase();

    if (HOTEL_EXCLUDE_RE.test(haystack)) return false;
    if (types.includes("hotel") || types.includes("lodging") || primaryType === "hotel" || primaryType === "lodging") {
      // Still reject obvious non-hotel lodging-ish categories.
      if (types.some((t) => t.includes("storage") || t.includes("campground") || t.includes("rv_park"))) return false;
      return true;
    }
    return HOTEL_INCLUDE_RE.test(haystack);
  };

  const filteredHotelResults = hotelResults.filter(isHotelLike);

  const toRows = (items: any[], category: "food" | "coffee" | "hotel") =>
    items.slice(0, limitPerCategory).map((item) => ({
      run_id: runId,
      place_id: item.place_id,
      name: item.name,
      category: classifyCategory(item.name, category),
      address: item.address ?? "",
      distance_meters: haversineMeters({ lat: venueLat, lng: venueLng }, { lat: item.lat, lng: item.lng }),
      maps_url: mapsUrl(item.place_id),
      is_sponsor: false,
    }));

  const sponsorRow = buildSponsorRow(runId);

  const rows = [
    ...(sponsorRow ? [sponsorRow] : []),
    ...toRows(foodResults, "food"),
    ...toRows(coffeeResults, "coffee"),
    ...toRows(filteredHotelResults, "hotel"),
  ];
  const uniqueRows: typeof rows = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.place_id)) continue; // avoid conflicts if the same place appears in both categories/sponsor
    seen.add(row.place_id);
    uniqueRows.push(row);
  }
  if (uniqueRows.length === 0) {
    return { ok: true, message: "no_results", foodCount: foodResults.length, coffeeCount: coffeeResults.length };
  }

  // Ensure a matching run row exists to satisfy FK constraints, regardless of column naming.
  try {
    let runCheck = await supabaseAdmin.from("owls_eye_runs" as any).select("id,run_id").eq("run_id", runId).maybeSingle();
    let missingRunIdColumn = false;
    if (runCheck.error?.code === "42703" || runCheck.error?.code === "PGRST204") {
      missingRunIdColumn = true;
      runCheck = await supabaseAdmin.from("owls_eye_runs" as any).select("id").eq("id", runId).maybeSingle();
    }
    if (!runCheck.data && !runCheck.error) {
      const nowIso = new Date().toISOString();
      const insertPayload: Record<string, any> = {
        id: runId,
        sport: params.sport,
        status: "running",
        created_at: nowIso,
        run_type: "manual",
      };
      if (params.venueId) {
        insertPayload.venue_id = params.venueId;
      }
      if (!missingRunIdColumn) {
        insertPayload.run_id = runId;
      }
      const { error: insertError } = await supabaseAdmin.from("owls_eye_runs" as any).upsert(insertPayload);
      if (insertError && insertError.code !== "42703" && insertError.code !== "42P01" && insertError.code !== "PGRST204") {
        console.warn("[owlseye] could not create run placeholder for nearby", insertError);
      }
    }
  } catch (err) {
    console.warn("[owlseye] run placeholder check failed", err);
  }

  const { error } = await supabaseAdmin.from("owls_eye_nearby_food" as any).upsert(uniqueRows, {
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
    hotelCount: Math.min(filteredHotelResults.length, limitPerCategory),
  };
}

export default upsertNearbyForRun;
