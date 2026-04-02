import haversineMeters from "@/lib/geo/haversineMeters";
import fetchNearbyPlaces from "@/lib/google/nearbySearch";

type UpsertParams = {
  supabaseAdmin: any;
  runId: string;
  venueId?: string;
  sport?:
    | "soccer"
    | "basketball"
    | "baseball"
    | "softball"
    | "football"
    | "lacrosse"
    | "hockey"
    | "volleyball"
    | "futsal";
  venueLat: number;
  venueLng: number;
  radiusMeters?: number;
  limitPerCategory?: number;
  force?: boolean;
};

const DEFAULT_RADIUS = 16093; // ~10 miles in meters
const HOTEL_RADIUS = 48280; // ~30 miles in meters
const SPORTING_GOODS_RADIUS = 40234; // ~25 miles in meters
const SPORTING_GOODS_MILES = 25;
const DEFAULT_LIMIT = 8;
const HOTEL_LIMIT = 5;
const SPORTING_GOODS_LIMIT = 6;
const HOTEL_INCLUDE_RE = /\b(hotel|motel|inn|resort|suite|suites|lodge)\b/i;
const HOTEL_EXCLUDE_RE =
  /\b(storage|self storage|mobile home|rv|campground|trailer|home park|apartment|apartments|condo|condominiums?|residential|residence|residences|retreat|getaway|holiday home|vacation rental|vacation rentals|private room|entire home|whole home|townhome|townhouse|single family|multi family|student housing|senior living|corporate housing|furnished rental|property management|leasing office|lease office|realty|real estate|homes for rent|villa rental)\b/i;
const HOTEL_BRAND_RE =
  /\b(hyatt|hilton|marriott|sheraton|westin|wyndham|fairfield|hampton|holiday inn|best western|comfort inn|motel 6|studio 6|extended stay america|residence inn|homewood suites|home2 suites|springhill suites|towneplace suites|aloft|tru by hilton|la quinta|days inn|super 8|courtyard|drury|radisson|quality inn|doubletree|embassy suites|staybridge|avid hotel)\b/i;
const VACATION_RENTAL_RE =
  /\b(home|house|studio|townhome|townhouse|cabin|villa|loft|bungalow|chalet|retreat|guesthouse|guest house|airbnb|vrbo)\b/i;
const HOTEL_TYPE_ALLOW = new Set(["lodging", "hotel", "motel", "resort_hotel", "extended_stay_hotel"]);
const HOTEL_TYPE_BLOCK_RE = /\b(apartment|real_estate|housing|storage|campground|rv_park|route|lodging_business|hostel|guest_house)\b/i;
const HOTEL_AMBIGUOUS_SIGNAL_RE =
  /\b(suites?|resort|lodge|inn|stay|retreat|villa|club)\b/i;

const SPORTING_EXCLUDE_RE =
  /\b(gun|guns|firearm|firearms|ammo|ammunition|armory|arms|range|shoot|shooter|shooters|tactical|surplus)\b|\b(run|runner|running)\b|\b(racquet|racket|racquetball|tennis|pickleball)\b|\b(golf|pro\s*shop|tee\s*it\s*up)\b|\b(bike|bicycle|cycling)\b|\b(bowling)\b|\b(outdoors?|outfitter|ski|snowboard|boot\s*fitting)\b|\b(motorsports?|powersports?)\b|\b(bait|tackle|fishing|marine|boat)\b|\b(airsoft|paintball)\b|\b(lululemon)\b/i;
const SPORTING_CHAIN_ALLOW_RE =
  /\b(dick'?s\b|academy\s+sports|big\s*5|play\s+it\s+again\s+sports|dunham'?s|scheels|sports\s+basement)\b/i;
const SPORTING_TEAM_ALLOW_RE = /\b(soccer|hockey|lacrosse|baseball|softball|basketball)\b/i;
const SPORTING_GENERIC_ALLOW_RE = /\b(sporting\\s+goods|sports\\s+equipment)\b/i;
const SPORTING_PRIMARY_TYPES = new Set(["sporting_goods_store", "sports_store", "outdoor_sports_store"]);
const BIG_BOX_ALLOW_RE = /\b(target|walmart|wal-mart|sam'?s\s*club|costco|meijer|fred\s*meyer)\b/i;

// Some Places API results are actually residential / short-term rental listings.
// These should never be promoted as "nearby amenities" for a tournament venue.
const RESIDENTIAL_STRONG_RE =
  /\b(mobile home|trailer|rv|campground|tent|private room|private bedroom|entire home|whole home|airbnb|vrbo|vacation rental|furnished|fully furn|garden apt|apartment|apartments|condo|condominiums?|townhome|townhouse|studio apartment|guest house|guesthouse|single family|multi family|bed\s*&\s*breakfast|b&b)\b/i;
const HOME_WORD_RE = /\bhome\b/i;
const HOME_CONTEXT_RE =
  /\b(near|private|bedroom|bathroom|furn|furnished|family|yard|neighborhood|getaway|retreat|garden|apt|apartment|condo|townhome|townhouse|airbnb|vrbo|vacation)\b/i;

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

function looksLikeResidentialListing(nameRaw: unknown, addressRaw: unknown) {
  const name = String(nameRaw ?? "").trim();
  const address = String(addressRaw ?? "").trim();
  const haystack = `${name} ${address}`.toLowerCase();

  if (RESIDENTIAL_STRONG_RE.test(haystack)) return true;

  // "Home" is too generic by itself; only block when the context looks like a rental listing
  // or the address is not a real street address (no street number).
  const hasHomeWord = HOME_WORD_RE.test(name);
  if (!hasHomeWord) return false;

  const hasStreetNumber = /\b\d{1,6}\b/.test(address);
  if (!hasStreetNumber) return true;
  if (HOME_CONTEXT_RE.test(haystack)) return true;

  return false;
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

type NearbyResult = {
  ok: boolean;
  message?: string;
  foodCount?: number;
  coffeeCount?: number;
  hotelCount?: number;
  sportingGoodsCount?: number;
  bigBoxFallbackCount?: number;
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
      // Hotels only: 20-mile radius and deeper fetch so filtering still returns enough real hotels.
      fetchNearbyPlaces({ ...baseOpts, type: "lodging", radiusMeters: HOTEL_RADIUS, maxResultCount: 50 }),
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
    const typedAsBlocked = types.some((t) => HOTEL_TYPE_BLOCK_RE.test(t)) || HOTEL_TYPE_BLOCK_RE.test(primaryType);
    const typedAsHotel = types.some((t) => HOTEL_TYPE_ALLOW.has(t)) || HOTEL_TYPE_ALLOW.has(primaryType);
    const hasBrandSignal = HOTEL_BRAND_RE.test(haystack);
    const hasHotelSignal = HOTEL_INCLUDE_RE.test(haystack) || hasBrandSignal;
    const hasAmbiguousSignal = HOTEL_AMBIGUOUS_SIGNAL_RE.test(haystack);
    const hasRentalSignal = VACATION_RENTAL_RE.test(haystack);
    const hasExcludedSignal = HOTEL_EXCLUDE_RE.test(haystack);

    if (typedAsBlocked) return false;
    if (hasExcludedSignal && !hasBrandSignal) return false;
    if (hasRentalSignal && !hasBrandSignal) return false;
    if (types.some((t) => t.includes("storage") || t.includes("campground") || t.includes("rv_park"))) return false;
    const hasLodgingType = types.includes("hotel") || types.includes("lodging") || primaryType === "hotel" || primaryType === "lodging" || typedAsHotel;

    // For lodging-typed results, require a real hotel signal and reject ambiguous residential-style names.
    if (hasLodgingType) {
      if (!hasHotelSignal) return false;
      if (hasAmbiguousSignal && !hasBrandSignal && (hasExcludedSignal || hasRentalSignal)) return false;
      return hasHotelSignal;
    }

    return hasHotelSignal && !hasExcludedSignal && !hasRentalSignal;
  };

  const filteredHotelResults = hotelResults.filter(isHotelLike);
  let finalHotelResults = filteredHotelResults;
  if (finalHotelResults.length < HOTEL_LIMIT) {
    const hotelTextResults = await fetchNearbyPlaces({
      ...baseOpts,
      type: "lodging",
      radiusMeters: HOTEL_RADIUS,
      maxResultCount: 20,
      forceTextSearch: true,
    });
    const filteredTextHotels = hotelTextResults.filter(isHotelLike);
    const merged = [...finalHotelResults, ...filteredTextHotels];
    const deduped: typeof merged = [];
    const seenPlaceIds = new Set<string>();
    for (const row of merged) {
      if (!row?.place_id || seenPlaceIds.has(row.place_id)) continue;
      seenPlaceIds.add(row.place_id);
      deduped.push(row);
    }
    finalHotelResults = deduped;
  }

  const isSportingGoodsPlace = (item: TextPlace) => {
    const name = String(item?.name ?? "").trim();
    if (!name) return false;
    if (SPORTING_EXCLUDE_RE.test(name)) return false;
    if (SPORTING_CHAIN_ALLOW_RE.test(name)) return true;
    if (SPORTING_TEAM_ALLOW_RE.test(name)) return true;
    const primaryType = String(item?.primaryType ?? "").trim();
    if (!SPORTING_PRIMARY_TYPES.has(primaryType)) return false;
    return SPORTING_GENERIC_ALLOW_RE.test(name);
  };

  const isBigBoxPlace = (item: TextPlace) => {
    const name = String(item?.name ?? "").trim();
    if (!name) return false;
    if (SPORTING_EXCLUDE_RE.test(name)) return false;
    return BIG_BOX_ALLOW_RE.test(name);
  };

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
    console.warn("[owlseye] Sporting goods search failed", err);
  }

  const toRows = (items: any[], category: "food" | "coffee" | "hotel", limit = limitPerCategory) =>
    items.slice(0, limit).map((item) => ({
      run_id: runId,
      place_id: item.place_id,
      name: item.name,
      category: classifyCategory(item.name, category),
      address: item.address ?? "",
      distance_meters: haversineMeters({ lat: venueLat, lng: venueLng }, { lat: item.lat, lng: item.lng }),
      maps_url: mapsUrl(item.place_id),
      is_sponsor: false,
    }));

  const toSportingRows = (items: TextPlace[], category: "sporting_goods" | "big_box_fallback") =>
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

  const sponsorRow = buildSponsorRow(runId);

  const rows = [
    ...(sponsorRow ? [sponsorRow] : []),
    ...toRows(foodResults, "food"),
    ...toRows(coffeeResults, "coffee"),
    ...toRows(finalHotelResults, "hotel", HOTEL_LIMIT),
    ...toSportingRows(sportingGoodsPlaces, "sporting_goods"),
    ...toSportingRows(bigBoxPlaces, "big_box_fallback"),
  ];
  const uniqueRows: typeof rows = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.place_id)) continue; // avoid conflicts if the same place appears in both categories/sponsor
    seen.add(row.place_id);
    if (!row.is_sponsor && row.category === "hotel" && looksLikeResidentialListing(row.name, row.address)) continue;
    uniqueRows.push(row);
  }
  if (force) {
    // Forced refresh should replace stale nearby rows for the run.
    const { error: clearError } = await supabaseAdmin.from("owls_eye_nearby_food" as any).delete().eq("run_id", runId);
    if (clearError) {
      console.warn("[owlseye] Could not clear existing nearby rows before forced refresh", clearError);
    }
  }

  if (uniqueRows.length === 0) {
    return {
      ok: true,
      message: "no_results",
      foodCount: foodResults.length,
      coffeeCount: coffeeResults.length,
      hotelCount: Math.min(finalHotelResults.length, HOTEL_LIMIT),
      sportingGoodsCount: sportingGoodsPlaces.length,
      bigBoxFallbackCount: bigBoxPlaces.length,
    };
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
    hotelCount: Math.min(finalHotelResults.length, HOTEL_LIMIT),
    sportingGoodsCount: sportingGoodsPlaces.length,
    bigBoxFallbackCount: bigBoxPlaces.length,
  };
}

export default upsertNearbyForRun;
