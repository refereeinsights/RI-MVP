import haversineMeters from "../../lib/geo/haversineMeters";

type UpsertGearParams = {
  supabaseAdmin: any;
  runId: string;
  venueLat: number;
  venueLng: number;
  force?: boolean;
};

const SPORTING_GOODS_RADIUS = 40234; // ~25 miles in meters
const SPORTING_GOODS_MILES = 25;
const SPORTING_GOODS_LIMIT = 6;

const SPORTING_EXCLUDE_RE =
  /\b(gun|guns|firearm|firearms|ammo|ammunition|armory|arms|range|shoot|shooter|shooters|tactical|surplus)\b|\b(run|runner|running)\b|\b(racquet|racket|racquetball|tennis|pickleball)\b|\b(golf|pro\s*shop|tee\s*it\s*up)\b|\b(bike|bicycle|cycling)\b|\b(bowling)\b|\b(outdoors?|outfitter|ski|snowboard|boot\s*fitting)\b|\b(motorsports?|powersports?)\b|\b(bait|tackle|fishing|marine|boat)\b|\b(airsoft|paintball)\b|\b(lululemon)\b/i;
const SPORTING_CHAIN_ALLOW_RE =
  /\b(dick'?s\b|academy\s+sports|big\s*5|play\s+it\s+again\s+sports|dunham'?s|scheels|sports\s+basement)\b/i;
const SPORTING_TEAM_ALLOW_RE = /\b(soccer|hockey|lacrosse|baseball|softball|basketball)\b/i;
const SPORTING_GENERIC_ALLOW_RE = /\b(sporting\s+goods|sports\s+equipment)\b/i;
const SPORTING_PRIMARY_TYPES = new Set(["sporting_goods_store", "sports_store", "outdoor_sports_store"]);
const BIG_BOX_ALLOW_RE = /\b(target|walmart|wal-mart|sam'?s\s*club|costco|meijer|fred\s*meyer)\b/i;

type TextPlace = {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  primaryType?: string;
};

function milesFromMeters(meters: number) {
  return meters / 1609.344;
}

function mapsUrl(placeId: string) {
  return `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`;
}

async function searchPlacesText(args: {
  apiKey: string;
  lat: number;
  lng: number;
  query: string;
  radiusMeters: number;
  maxResultCount?: number;
}): Promise<TextPlace[]> {
  const safeMax = Math.max(1, Math.min(20, Math.floor(args.maxResultCount ?? 20)));
  const endpoint = "https://places.googleapis.com/v1/places:searchText";
  const fieldMask = "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType";

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": args.apiKey,
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
        maxResultCount: safeMax,
        rankPreference: "DISTANCE",
      }),
    });
    if (!resp.ok) return [];
    const json = (await resp.json()) as { places?: any[] };
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
        } satisfies TextPlace;
      })
      .filter(Boolean) as TextPlace[];
  } catch {
    return [];
  }
}

function isSportingGoodsPlace(item: TextPlace) {
  const name = String(item?.name ?? "").trim();
  if (!name) return false;
  if (SPORTING_EXCLUDE_RE.test(name)) return false;
  if (SPORTING_CHAIN_ALLOW_RE.test(name)) return true;
  if (SPORTING_TEAM_ALLOW_RE.test(name)) return true;
  const primaryType = String(item?.primaryType ?? "").trim();
  if (!SPORTING_PRIMARY_TYPES.has(primaryType)) return false;
  return SPORTING_GENERIC_ALLOW_RE.test(name);
}

function isBigBoxPlace(item: TextPlace) {
  const name = String(item?.name ?? "").trim();
  if (!name) return false;
  if (SPORTING_EXCLUDE_RE.test(name)) return false;
  return BIG_BOX_ALLOW_RE.test(name);
}

export async function upsertGearNearbyForRun(params: UpsertGearParams) {
  const { supabaseAdmin, runId, venueLat, venueLng, force = false } = params;
  if (!supabaseAdmin || !runId) return { ok: false, message: "missing_supabase_or_run" as const };

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn("[owlseye] Missing GOOGLE_PLACES_API_KEY; skipping gear nearby fetch");
    return { ok: false, message: "missing_api_key" as const };
  }

  const sortByDistance = (items: TextPlace[]) =>
    [...items].sort(
      (a, b) =>
        haversineMeters({ lat: venueLat, lng: venueLng }, { lat: a.lat, lng: a.lng }) -
        haversineMeters({ lat: venueLat, lng: venueLng }, { lat: b.lat, lng: b.lng })
    );

  const dedupePlaces = (items: TextPlace[]) => {
    const out: TextPlace[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (!item?.place_id || seen.has(item.place_id)) continue;
      const meters = haversineMeters({ lat: venueLat, lng: venueLng }, { lat: item.lat, lng: item.lng });
      if (milesFromMeters(meters) > SPORTING_GOODS_MILES) continue;
      seen.add(item.place_id);
      out.push(item);
    }
    return out;
  };

  const sportingGoodsQueries = ["sporting goods store", "sports equipment store", "soccer store", "hockey shop"];
  const bigBoxQueries = ["Target", "Walmart", "Walmart Supercenter", "Target store"];

  let sportingGoodsPlaces: TextPlace[] = [];
  let bigBoxPlaces: TextPlace[] = [];
  try {
    const raw = (
      await Promise.all(
        sportingGoodsQueries.map((query) =>
          searchPlacesText({
            apiKey,
            lat: venueLat,
            lng: venueLng,
            query,
            radiusMeters: SPORTING_GOODS_RADIUS,
            maxResultCount: 20,
          })
        )
      )
    ).flat();

    const deduped = dedupePlaces(raw);
    sportingGoodsPlaces = sortByDistance(deduped.filter(isSportingGoodsPlace)).slice(0, SPORTING_GOODS_LIMIT);

    if (sportingGoodsPlaces.length === 0) {
      const fallbackRaw = (
        await Promise.all(
          bigBoxQueries.map((query) =>
            searchPlacesText({
              apiKey,
              lat: venueLat,
              lng: venueLng,
              query,
              radiusMeters: SPORTING_GOODS_RADIUS,
              maxResultCount: 20,
            })
          )
        )
      ).flat();
      const fallbackDeduped = dedupePlaces(fallbackRaw);
      bigBoxPlaces = sortByDistance(fallbackDeduped.filter(isBigBoxPlace)).slice(0, SPORTING_GOODS_LIMIT);
    }
  } catch (err) {
    console.warn("[owlseye] Gear nearby search failed", err);
  }

  const toRows = (items: TextPlace[], category: "sporting_goods" | "big_box_fallback") =>
    items.slice(0, SPORTING_GOODS_LIMIT).map((item) => ({
      run_id: runId,
      place_id: item.place_id,
      name: item.name,
      category,
      address: item.address ?? "",
      distance_meters: haversineMeters({ lat: venueLat, lng: venueLng }, { lat: item.lat, lng: item.lng }),
      maps_url: mapsUrl(item.place_id),
      is_sponsor: false,
    }));

  const rows = [...toRows(sportingGoodsPlaces, "sporting_goods"), ...toRows(bigBoxPlaces, "big_box_fallback")];

  if (rows.length === 0) {
    return {
      ok: true,
      message: "no_results" as const,
      sportingGoodsCount: sportingGoodsPlaces.length,
      bigBoxFallbackCount: bigBoxPlaces.length,
    };
  }

  if (force) {
    const { error: clearError } = await supabaseAdmin
      .from("owls_eye_nearby_food" as any)
      .delete()
      .eq("run_id", runId)
      .in("category", ["sporting_goods", "big_box_fallback"]);
    if (clearError) {
      console.warn("[owlseye] Could not clear existing gear nearby rows before refresh", clearError);
    }
  }

  const { error } = await supabaseAdmin.from("owls_eye_nearby_food" as any).upsert(rows, {
    onConflict: "run_id,place_id",
  });
  if (error) {
    console.error("[owlseye] Gear nearby upsert failed", error);
    return { ok: false, message: error.message as string };
  }

  return {
    ok: true,
    message: "inserted" as const,
    sportingGoodsCount: sportingGoodsPlaces.length,
    bigBoxFallbackCount: bigBoxPlaces.length,
  };
}

export default upsertGearNearbyForRun;
