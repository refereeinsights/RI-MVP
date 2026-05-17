import haversineMeters from "@/lib/geo/haversineMeters";
import fetchNearbyPlaces from "@/lib/google/nearbySearch";
import { EXTERNAL_API, EXTERNAL_API_SURFACE, trackExternalCall } from "@/lib/trackExternalCall";
import { CURRENT_OWL_CATEGORIES } from "../categories";
import { COFFEE_CATEGORY_IDS, FOOD_CATEGORY_IDS, HANGOUT_CATEGORY_IDS, LODGING_CATEGORY_IDS, QUICK_EATS_CATEGORY_IDS } from "../foursquareCategories";
import { FoursquareHttpError, searchFoursquarePlaces } from "./foursquarePlaces";
import { hangoutsRankTier, tagAndFilterEnhancedPlaces, type OwlEnhancedCategory } from "./quickEatsHangouts";
import { tagAndFilterCoffeePlaces } from "./coffeePlaces";
import { searchOverpassSportingGoods } from "./overpassSportingGoods";

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
  // When specified, only fetch these categories (targeted run). Omit to fetch all.
  categoriesToFetch?: string[];
};

const DEFAULT_RADIUS = 16093; // ~10 miles in meters
const HOTEL_RADIUS = 48280; // ~30 miles in meters
const SPORTING_GOODS_RADIUS = 40234; // ~25 miles in meters
const SPORTING_GOODS_MILES = 25;
const DEFAULT_LIMIT = 8;
const HOTEL_LIMIT = 5;
const SPORTING_GOODS_LIMIT = 6;
const ENHANCED_LIMIT = 8;
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
  /\b(mobile home|trailer|rv|campground|tent|private room|private bedroom|shared bathroom|ensuite|private entrance|guest suite|entire suite|entire home|whole home|airbnb|vrbo|vacation rental|furnished|fully furn|garden apt|apartment|apartments|condo|condominiums?|townhome|townhouse|studio apartment|guest house|guesthouse|single family|multi family|bed\s*&\s*breakfast|b&b)\b/i;
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
  business_status?: string;
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
  const fieldMask =
    "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.businessStatus";

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
          business_status: typeof p.businessStatus === "string" ? p.businessStatus : undefined,
        } satisfies TextPlace;
      })
      .filter(Boolean) as TextPlace[];
  } catch {
    return [];
  }
}

type NearbyDebugItem = {
  name: string;
  address: string;
  distance_meters: number;
  kept: boolean;
  reject_reason?: string;
  reason_tags?: string[];
  strong_match?: boolean;
  fsq_place_id?: string;
  fsq_categories?: Array<{ id: string; name: string }>;
};

type NearbyDebugQuery = {
  category: string;
  provider: "foursquare" | "google_fallback" | "google" | "overpass";
  radius_meters: number;
  category_ids?: string[];
  result_count: number;
  kept_count: number;
  weak?: boolean;
  weak_reason?: string | null;
  items: NearbyDebugItem[];
};

type NearbyResult = {
  ok: boolean;
  message?: string;
  foodCount?: number;
  coffeeCount?: number;
  hotelCount?: number;
  sportingGoodsCount?: number;
  bigBoxFallbackCount?: number;
  quickEatsCount?: number;
  hangoutsCount?: number;
  rawDebug?: { queries: NearbyDebugQuery[] };
};

function isoUtcStartOfDay(d = new Date()) {
  const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  return dd.toISOString();
}

function isoUtcStartOfTomorrow(d = new Date()) {
  const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0));
  return dd.toISOString();
}

function isoUtcStartOfMonth(d = new Date()) {
  const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
  return dd.toISOString();
}

function isoUtcStartOfNextMonth(d = new Date()) {
  const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0));
  return dd.toISOString();
}

async function countExternalCalls(args: {
  supabaseAdmin: any;
  api: string;
  fromIso: string;
  toIsoExclusive: string;
}) {
  try {
    const { count } = await args.supabaseAdmin
      .from("external_api_calls" as any)
      .select("id", { count: "exact", head: true })
      .eq("api", args.api)
      .gte("called_at", args.fromIso)
      .lt("called_at", args.toIsoExclusive);
    return typeof count === "number" ? count : 0;
  } catch {
    // If the table isn't present yet, fail open (tracking is best-effort).
    return 0;
  }
}

async function withinBudgets(args: {
  supabaseAdmin: any;
  api: string;
  dailyLimit: number;
  monthlyLimit: number;
}) {
  const now = new Date();
  const [daily, monthly] = await Promise.all([
    countExternalCalls({
      supabaseAdmin: args.supabaseAdmin,
      api: args.api,
      fromIso: isoUtcStartOfDay(now),
      toIsoExclusive: isoUtcStartOfTomorrow(now),
    }),
    countExternalCalls({
      supabaseAdmin: args.supabaseAdmin,
      api: args.api,
      fromIso: isoUtcStartOfMonth(now),
      toIsoExclusive: isoUtcStartOfNextMonth(now),
    }),
  ]);
  return daily < args.dailyLimit && monthly < args.monthlyLimit;
}

export async function upsertNearbyForRun(params: UpsertParams): Promise<NearbyResult> {
  const {
    supabaseAdmin,
    runId,
    venueLat,
    venueLng,
    radiusMeters = DEFAULT_RADIUS,
    limitPerCategory = DEFAULT_LIMIT,
    force = false,
    categoriesToFetch,
  } = params;

  // Targeted run: only fetch specific categories and merge into existing run.
  const isTargetedRun = Array.isArray(categoriesToFetch) && categoriesToFetch.length > 0;
  const shouldFetch = (category: string) => !isTargetedRun || categoriesToFetch!.includes(category);

  if (!supabaseAdmin || !runId) return { ok: false, message: "missing_supabase_or_run" };

  const runMeta = await (async () => {
    try {
      // Some environments have `run_id`; older ones may only have `id`.
      const baseSelect = "ttl_until,categories_fetched,outputs,status";
      let resp = await supabaseAdmin.from("owls_eye_runs" as any).select(baseSelect).eq("run_id", runId).maybeSingle();
      if (resp.error?.code === "42703" || resp.error?.code === "PGRST204") {
        resp = await supabaseAdmin.from("owls_eye_runs" as any).select(baseSelect).eq("id", runId).maybeSingle();
      }
      return resp.data as
        | {
            ttl_until?: string | null;
            categories_fetched?: string[] | null;
            outputs?: any;
            status?: string | null;
          }
        | null;
    } catch {
      return null;
    }
  })();

  const isRunFresh = (() => {
    const ttl = String(runMeta?.ttl_until ?? "").trim();
    if (!ttl) return false;
    const dt = new Date(ttl);
    if (!Number.isFinite(dt.getTime())) return false;
    return dt.getTime() > Date.now();
  })();

  const runHasCategory = (category: string) => {
    const existing: string[] = Array.isArray(runMeta?.categories_fetched) ? (runMeta?.categories_fetched as string[]) : [];
    return existing.includes(category);
  };

  // Skip early-return for targeted runs — we're adding new categories to an existing run.
  if (!force && !isTargetedRun) {
    const { count, error: countError } = await supabaseAdmin
      .from("owls_eye_nearby_food" as any)
      .select("run_id", { count: "exact", head: true })
      .eq("run_id", runId);
    if (!countError && (count ?? 0) > 0) {
      return { ok: true, message: "already_exists" };
    }
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const attemptedCategories = new Set<string>();

  const fsqKey = process.env.FSQ_API_KEY || process.env.FOURSQUARE_API_KEY || "";
  const fsqEnabled = (process.env.FOURSQUARE_ENABLED ?? "true").toLowerCase() === "true";
  const fsqVersion = process.env.FOURSQUARE_API_VERSION || "2025-06-17";
  const fsqDailyLimit = Math.max(0, Number(process.env.FOURSQUARE_DAILY_CALL_LIMIT ?? 500));
  const fsqMonthlyLimit = Math.max(0, Number(process.env.FOURSQUARE_MONTHLY_CALL_LIMIT ?? 35000));

  const googleFallbackEnabled = (process.env.GOOGLE_FALLBACK_FOR_OWLS_EYE_ENABLED ?? "true").toLowerCase() === "true";
  const googleDailyLimit = Math.max(0, Number(process.env.GOOGLE_FALLBACK_DAILY_CALL_LIMIT ?? 100));
  const googleMonthlyLimit = Math.max(0, Number(process.env.GOOGLE_FALLBACK_MONTHLY_CALL_LIMIT ?? 3000));

  const baseOpts = { lat: venueLat, lng: venueLng, radiusMeters, apiKey };
  type ProviderPlace = any & { provider?: "google" | "foursquare"; provider_place_id?: string; distance_meters?: number };
  let foodResults: ProviderPlace[] = [];
  let hotelResults: ProviderPlace[] = [];
  const nearbyDebugQueries: NearbyDebugQuery[] = [];

  const runFsqPrimary = async (args: {
    category: "food" | "hotel";
    categoryIds: string[];
    radius: number;
    limit: number;
  }) => {
    if (!fsqEnabled || !fsqKey || args.categoryIds.length === 0) {
      return { ok: false as const, reason: !fsqEnabled ? "foursquare_disabled" : "missing_foursquare_key" };
    }
    const canCall = await withinBudgets({
      supabaseAdmin,
      api: EXTERNAL_API.foursquare,
      dailyLimit: fsqDailyLimit,
      monthlyLimit: fsqMonthlyLimit,
    });
    if (!canCall) return { ok: false as const, reason: "budget_exceeded" };

    const raw = await trackExternalCall(EXTERNAL_API.foursquare, "places_search", EXTERNAL_API_SURFACE.owls_eye_batch, () =>
      searchFoursquarePlaces({
        apiKey: fsqKey,
        apiVersion: fsqVersion,
        lat: venueLat,
        lng: venueLng,
        radiusMeters: args.radius,
        categoryIds: args.categoryIds,
        limit: args.limit,
        paramMode: "fsq_category_ids",
      })
    );

    const mapped: ProviderPlace[] = raw.map((p) => ({
      place_id: `fsq:${p.fsq_place_id}`,
      provider: "foursquare",
      provider_place_id: p.fsq_place_id,
      name: p.name,
      address: p.address ?? "",
      lat: p.lat,
      lng: p.lng,
      distance_meters:
        typeof p.distance_meters === "number"
          ? p.distance_meters
          : Math.round(haversineMeters({ lat: venueLat, lng: venueLng }, { lat: p.lat, lng: p.lng })),
      categories: p.categories,
      status: p.status,
      closed_bucket: p.closed_bucket,
      closed_reason: p.closed_reason,
      is_closed: p.is_closed,
      permanently_closed: p.permanently_closed,
      temporarily_closed: p.temporarily_closed,
    }));

    // Basic closure filtering (no extra detail calls).
    const filtered = mapped.filter((p) => {
      if (p.is_closed === true) return false;
      if (p.permanently_closed === true || p.temporarily_closed === true) return false;
      const status = String((p as any)?.status ?? "").toLowerCase();
      const bucket = String((p as any)?.closed_bucket ?? "").toLowerCase();
      const reason = String((p as any)?.closed_reason ?? "").toLowerCase();
      if (status && /closed|inactive|permanent/i.test(status)) return false;
      if (bucket && /closed|inactive|permanent/i.test(bucket)) return false;
      if (reason && /closed|inactive|permanent/i.test(reason)) return false;
      return true;
    });

    return { ok: true as const, results: filtered };
  };

  if (shouldFetch("food")) {
    attemptedCategories.add("food");
    try {
      const fsq = await runFsqPrimary({ category: "food", categoryIds: FOOD_CATEGORY_IDS, radius: radiusMeters, limit: 25 });
      if (fsq.ok) {
        foodResults = fsq.results;
        nearbyDebugQueries.push({
          category: "food",
          provider: "foursquare",
          radius_meters: radiusMeters,
          category_ids: FOOD_CATEGORY_IDS,
          result_count: fsq.results.length,
          kept_count: Math.min(fsq.results.length, limitPerCategory),
          items: fsq.results.slice(0, limitPerCategory).map((p) => ({
            name: String(p.name ?? ""),
            address: String(p.address ?? ""),
            distance_meters: Math.round(p.distance_meters ?? 0),
            kept: true,
            fsq_place_id: String(p.provider_place_id ?? ""),
            fsq_categories: Array.isArray((p as any)?.categories)
              ? ((p as any).categories as any[]).map((c) => ({ id: String(c?.fsq_category_id ?? ""), name: String(c?.name ?? "") }))
              : undefined,
          })),
        });
      }
      if (!fsq.ok || foodResults.length < DEFAULT_LIMIT) {
        const reason = fsq.ok ? "foursquare_thin_results" : fsq.reason;
        if (googleFallbackEnabled && apiKey) {
          const canCallGoogle = await withinBudgets({
            supabaseAdmin,
            api: EXTERNAL_API.google_places,
            dailyLimit: googleDailyLimit,
            monthlyLimit: googleMonthlyLimit,
          });
          if (canCallGoogle) {
            const google = await trackExternalCall(EXTERNAL_API.google_places, "nearby_search", EXTERNAL_API_SURFACE.owls_eye_batch, () =>
              fetchNearbyPlaces({ ...baseOpts, type: "restaurant" })
            );
            const mapped = (google ?? []).map((g: any) => ({ ...g, provider: "google", provider_place_id: g.place_id }));
            foodResults = mapped;
            nearbyDebugQueries.push({
              category: "food",
              provider: "google_fallback",
              radius_meters: radiusMeters,
              result_count: (google ?? []).length,
              kept_count: Math.min((google ?? []).length, limitPerCategory),
              weak: true,
              weak_reason: reason ?? null,
              items: (google ?? []).slice(0, limitPerCategory).map((item: any) => ({
                name: String(item.name ?? ""),
                address: String(item.address ?? ""),
                distance_meters: Math.round(haversineMeters({ lat: venueLat, lng: venueLng }, { lat: item.lat, lng: item.lng })),
                kept: true,
              })),
            });
          }
        }
      }
    } catch (err) {
      console.error("[owlseye] Food fetch failed", err);
      return { ok: false, message: err instanceof Error ? err.message : "food_fetch_failed" };
    }
  }

  if (shouldFetch("hotel")) {
    attemptedCategories.add("hotel");
    try {
      const fsq = await runFsqPrimary({ category: "hotel", categoryIds: LODGING_CATEGORY_IDS, radius: HOTEL_RADIUS, limit: 25 });
      if (fsq.ok) {
        hotelResults = fsq.results;
        nearbyDebugQueries.push({
          category: "hotel",
          provider: "foursquare",
          radius_meters: HOTEL_RADIUS,
          category_ids: LODGING_CATEGORY_IDS,
          result_count: fsq.results.length,
          kept_count: fsq.results.length,
          items: fsq.results.map((p) => ({
            name: String(p.name ?? ""),
            address: String(p.address ?? ""),
            distance_meters: Math.round(p.distance_meters ?? 0),
            kept: true,
            fsq_place_id: String(p.provider_place_id ?? ""),
            fsq_categories: Array.isArray((p as any)?.categories)
              ? ((p as any).categories as any[]).map((c) => ({ id: String(c?.fsq_category_id ?? ""), name: String(c?.name ?? "") }))
              : undefined,
          })),
        });
      }
      if (!fsq.ok || hotelResults.length < HOTEL_LIMIT) {
        const reason = fsq.ok ? "foursquare_thin_results" : fsq.reason;
        if (googleFallbackEnabled && apiKey) {
          const canCallGoogle = await withinBudgets({
            supabaseAdmin,
            api: EXTERNAL_API.google_places,
            dailyLimit: googleDailyLimit,
            monthlyLimit: googleMonthlyLimit,
          });
          if (canCallGoogle) {
            const google = await trackExternalCall(EXTERNAL_API.google_places, "nearby_search", EXTERNAL_API_SURFACE.owls_eye_batch, () =>
              fetchNearbyPlaces({ ...baseOpts, type: "lodging", radiusMeters: HOTEL_RADIUS, maxResultCount: 50 })
            );
            hotelResults = (google ?? []).map((g: any) => ({ ...g, provider: "google", provider_place_id: g.place_id }));
            nearbyDebugQueries.push({
              category: "hotel",
              provider: "google_fallback",
              radius_meters: HOTEL_RADIUS,
              result_count: (google ?? []).length,
              kept_count: (google ?? []).length,
              weak: true,
              weak_reason: reason ?? null,
              items: (google ?? []).map((item: any) => ({
                name: String(item.name ?? ""),
                address: String(item.address ?? ""),
                distance_meters: Math.round(haversineMeters({ lat: venueLat, lng: venueLng }, { lat: item.lat, lng: item.lng })),
                kept: true,
              })),
            });
          }
        }
      }
    } catch (err) {
      console.error("[owlseye] Hotel fetch failed", err);
      return { ok: false, message: err instanceof Error ? err.message : "hotel_fetch_failed" };
    }
  }

  if (!apiKey && (shouldFetch("food") || shouldFetch("coffee") || shouldFetch("hotel"))) {
    console.warn("[owlseye] Missing GOOGLE_PLACES_API_KEY; Google fallback disabled");
  }

  const enhancedNearby: Record<OwlEnhancedCategory, { places: ReturnType<typeof tagAndFilterEnhancedPlaces>; usedGoogleFallback: boolean; fallbackReason?: string; radius?: number }> =
    {
      quick_eats: { places: [], usedGoogleFallback: false },
      hangouts: { places: [], usedGoogleFallback: false },
    };

  const fsqDebugRequests: Array<Record<string, any>> = [];
  const hangoutsStats = {
    excluded_dog_parks: 0,
    brewery_matches: 0,
    brewery_promoted_to_top: false,
  };

  // (fsq/google fallback config is initialized above; keep single source of truth)

  const radiiByCategory: Record<OwlEnhancedCategory, number[]> = {
    quick_eats: [5000, 8000, 12000],
    hangouts: [8000, 12000, 16000],
  };
  const thresholdByCategory: Record<OwlEnhancedCategory, number> = {
    quick_eats: 3,
    hangouts: 2,
  };

  const runEnhanced = async (category: OwlEnhancedCategory) => {
    if (!shouldFetch(category)) return;
    // If we already have this category in a fresh, complete run, avoid re-calling providers.
    // Targeted runs always proceed — they're explicitly requesting specific categories.
    if (!force && !isTargetedRun && isRunFresh && runHasCategory(category)) return;

    if (!fsqEnabled || !fsqKey) {
      enhancedNearby[category].usedGoogleFallback = true;
      enhancedNearby[category].fallbackReason = !fsqEnabled ? "foursquare_disabled" : "missing_foursquare_key";
    }

    const categoryIds = category === "quick_eats" ? QUICK_EATS_CATEGORY_IDS : HANGOUT_CATEGORY_IDS;
    const limit = 25;

    let bestTagged: ReturnType<typeof tagAndFilterEnhancedPlaces> = [];
    let bestRadius: number | undefined;
    let weak = true;
    let lastWeakReason: string | undefined;

    const isWeak = (tagged: ReturnType<typeof tagAndFilterEnhancedPlaces>, rawCount: number, isInitial: boolean) => {
      const excludedCount = tagged.filter((t) => t.excluded).length;
      const qualified = tagged.filter((t) => t.qualified);
      const qualifiedCount = qualified.length;
      const strongCount = qualified.filter((t) => t.strong_match).length;
      const noiseRatio = rawCount > 0 ? excludedCount / rawCount : 0;
      if (qualifiedCount < thresholdByCategory[category]) return { weak: true, reason: "too_few_qualified" };
      if (noiseRatio > 0.5) return { weak: true, reason: "too_noisy" };
      if (strongCount === 0) return { weak: true, reason: "no_strong_match" };
      if (isInitial) {
        const farAll = qualified.every((t) => t.distance_meters > 8000);
        if (farAll) return { weak: true, reason: "too_far_initial" };
      }
      return { weak: false, reason: undefined };
    };

    if (fsqEnabled && fsqKey && categoryIds.length > 0) {
      for (let idx = 0; idx < radiiByCategory[category].length; idx++) {
        const radius = radiiByCategory[category][idx];
        const isInitial = idx === 0;

        const canCall = await withinBudgets({
          supabaseAdmin,
          api: EXTERNAL_API.foursquare,
          dailyLimit: fsqDailyLimit,
          monthlyLimit: fsqMonthlyLimit,
        });
        if (!canCall) {
          weak = true;
          lastWeakReason = "budget_exceeded";
          break;
        }

        let raw: any[] = [];
        let paramMode: "fsq_category_ids" | "categories" =
          category === "quick_eats" ? "fsq_category_ids" : "fsq_category_ids";
        let hangoutsFallbackUsed = false;
        try {
          const callOnce = async (mode: "fsq_category_ids" | "categories") =>
            trackExternalCall(EXTERNAL_API.foursquare, "places_search", EXTERNAL_API_SURFACE.owls_eye_batch, () =>
              searchFoursquarePlaces({
                apiKey: fsqKey,
                apiVersion: fsqVersion,
                lat: venueLat,
                lng: venueLng,
                radiusMeters: radius,
                categoryIds,
                limit,
                paramMode: mode,
              })
            );

          if (category === "quick_eats") {
            // Quick Eats: must use fsq_category_ids (fail closed).
            raw = await callOnce("fsq_category_ids");
            paramMode = "fsq_category_ids";
          } else {
            // Hangouts: prefer fsq_category_ids, but may fall back to categories on unsupported param.
            try {
              raw = await callOnce("fsq_category_ids");
              paramMode = "fsq_category_ids";
            } catch (e) {
              if (e instanceof FoursquareHttpError && e.status === 400) {
                raw = await callOnce("categories");
                paramMode = "categories";
                hangoutsFallbackUsed = true;
              } else {
                throw e;
              }
            }
          }
        } catch (err) {
          weak = true;
          lastWeakReason = "foursquare_error";
          // eslint-disable-next-line no-console
          console.warn("[owlseye] FSQ call failed", { category, radius: radiiByCategory[category][0], error: String((err as any)?.message ?? err) });
          break;
        }

        const tagged = tagAndFilterEnhancedPlaces({
          category,
          provider: "foursquare",
          places: raw,
          venueLat,
          venueLng,
        });

        const qualified = tagged.filter((t) => t.qualified);
        const dedupedQualified: typeof qualified = [];
        const seen = new Set<string>();
        for (const q of qualified.sort((a, b) => a.distance_meters - b.distance_meters)) {
          if (seen.has(q.place_id)) continue;
          seen.add(q.place_id);
          dedupedQualified.push(q);
        }

        const rankedQualified = (() => {
          if (category !== "hangouts") return dedupedQualified;
          const sorted = [...dedupedQualified].sort((a, b) => {
            const tierA = hangoutsRankTier(a);
            const tierB = hangoutsRankTier(b);
            if (tierA !== tierB) return tierA - tierB;
            return a.distance_meters - b.distance_meters;
          });
          return sorted;
        })();

        const weakCheck = isWeak(tagged, raw.length, isInitial);
        weak = weakCheck.weak;
        lastWeakReason = weakCheck.reason;

        bestTagged = rankedQualified;
        bestRadius = radius;

        if (category === "hangouts") {
          hangoutsStats.excluded_dog_parks += tagged.filter((t) => t.excluded_reason === "dog_park").length;
          const breweryCount = tagged.filter((t) => t.qualified && t.reason_tags?.includes("brewery")).length;
          hangoutsStats.brewery_matches += breweryCount;
          if (!hangoutsStats.brewery_promoted_to_top && breweryCount > 0 && rankedQualified[0]?.reason_tags?.includes("brewery")) {
            hangoutsStats.brewery_promoted_to_top = true;
          }
        }

        fsqDebugRequests.push({
          endpoint: "https://places-api.foursquare.com/places/search",
          ll: `${venueLat},${venueLng}`,
          radius,
          limit,
          sort: "DISTANCE",
          param_mode: paramMode,
          category_ids: categoryIds,
          category,
          result_count: raw.length,
          qualified_count: tagged.filter((t) => t.qualified).length,
          excluded_count: tagged.filter((t) => t.excluded).length,
          weak: weakCheck.weak,
          weak_reason: weakCheck.reason ?? null,
          hangouts_fsq_category_ids_unsupported: hangoutsFallbackUsed ? true : undefined,
        });

        nearbyDebugQueries.push({
          category,
          provider: "foursquare",
          radius_meters: radius,
          category_ids: categoryIds,
          result_count: raw.length,
          kept_count: tagged.filter((t) => t.qualified).length,
          weak: weakCheck.weak,
          weak_reason: weakCheck.reason ?? null,
          items: tagged.map((t) => {
            const rawFsq = (raw as any[]).find((r) => r.fsq_place_id === t.provider_place_id);
            return {
              name: t.name,
              address: t.address,
              distance_meters: t.distance_meters,
              kept: t.qualified,
              reject_reason: t.excluded ? t.excluded_reason : !t.qualified ? "not_qualified" : undefined,
              reason_tags: t.reason_tags,
              strong_match: t.strong_match,
              fsq_place_id: t.provider_place_id,
              fsq_categories: (rawFsq?.categories ?? []).map((c: any) => ({
                id: String(c.fsq_category_id ?? ""),
                name: String(c.name ?? ""),
              })),
            };
          }),
        });

        if (!weak) break;
      }
    }

    // Mark as attempted when we had category IDs and ran the logic (even if results are empty).
    if (fsqEnabled && fsqKey && categoryIds.length > 0) attemptedCategories.add(category);

    if (!weak && bestTagged.length > 0) {
      enhancedNearby[category].places = bestTagged.slice(0, ENHANCED_LIMIT);
      enhancedNearby[category].radius = bestRadius;
      return;
    }

    // Google fallback (1 call max per category per run), only when FSQ results are weak/unavailable.
    if (!googleFallbackEnabled || !apiKey) {
      // Fail closed: do not store weak/noisy FSQ results when fallback isn't available.
      // eslint-disable-next-line no-console
      console.warn("[owlseye] Google fallback skipped", { category, reason: !googleFallbackEnabled ? "disabled" : "missing_GOOGLE_PLACES_API_KEY" });
      enhancedNearby[category].places = [];
      enhancedNearby[category].usedGoogleFallback = false;
      enhancedNearby[category].fallbackReason = lastWeakReason ?? "foursquare_low_quality";
      return;
    }

    const canCallGoogle = await withinBudgets({
      supabaseAdmin,
      api: EXTERNAL_API.google_places,
      dailyLimit: googleDailyLimit,
      monthlyLimit: googleMonthlyLimit,
    });
    if (!canCallGoogle) {
      // eslint-disable-next-line no-console
      console.warn("[owlseye] Google fallback skipped — budget exceeded", { category });
      enhancedNearby[category].places = [];
      enhancedNearby[category].usedGoogleFallback = false;
      enhancedNearby[category].fallbackReason = "budget_exceeded";
      return;
    }

    const query =
      category === "quick_eats"
        ? "subway or sandwich shop or pizza or fast casual or burrito bowl"
        : "brewery with food or arcade or bowling or mini golf or family friendly park";

    const googleRaw = await trackExternalCall(EXTERNAL_API.google_places, "nearby_search_text", EXTERNAL_API_SURFACE.owls_eye_batch, () =>
      searchPlacesText({
        apiKey,
        lat: venueLat,
        lng: venueLng,
        query,
        radiusMeters: radiiByCategory[category][radiiByCategory[category].length - 1],
        maxResultCount: 20,
      })
    );
    attemptedCategories.add(category);
    const taggedGoogle = tagAndFilterEnhancedPlaces({
      category,
      provider: "google",
      places: googleRaw,
      venueLat,
      venueLng,
    });
    const qualifiedGoogle = taggedGoogle.filter((t) => t.qualified);
    enhancedNearby[category].places = qualifiedGoogle.slice(0, ENHANCED_LIMIT);
    enhancedNearby[category].usedGoogleFallback = true;
    enhancedNearby[category].fallbackReason =
      lastWeakReason === "budget_exceeded" ? "budget_exceeded" : lastWeakReason ?? "foursquare_low_quality";
    enhancedNearby[category].radius = radiiByCategory[category][radiiByCategory[category].length - 1];

    nearbyDebugQueries.push({
      category,
      provider: "google_fallback",
      radius_meters: radiiByCategory[category][radiiByCategory[category].length - 1],
      result_count: googleRaw.length,
      kept_count: qualifiedGoogle.length,
      items: taggedGoogle.map((t) => ({
        name: t.name,
        address: t.address,
        distance_meters: t.distance_meters,
        kept: t.qualified,
        reject_reason: t.excluded ? t.excluded_reason : !t.qualified ? "not_qualified" : undefined,
        reason_tags: t.reason_tags,
        strong_match: t.strong_match,
      })),
    });
  };

  await Promise.all([runEnhanced("quick_eats"), runEnhanced("hangouts")]);

  // Coffee (core category): Foursquare primary + Google fallback only when needed.
  const coffeeRadii = [3000, 5000, 8000];
  const coffeeThreshold = 2;
  const runCoffee = async () => {
    if (!shouldFetch("coffee")) return;
    if (!force && !isTargetedRun && isRunFresh && runHasCategory("coffee")) return;

    const limit = 25;
    let bestTagged: ReturnType<typeof tagAndFilterCoffeePlaces> = [];
    let bestRadius: number | undefined;
    let weak = true;
    let lastWeakReason: string | undefined;

    const isWeakCoffee = (tagged: ReturnType<typeof tagAndFilterCoffeePlaces>, rawCount: number) => {
      const excludedCount = tagged.filter((t) => t.excluded).length;
      const qualified = tagged.filter((t) => t.qualified);
      const qualifiedCount = qualified.length;
      const strongCount = qualified.filter((t) => t.strong_match).length;
      const noiseRatio = rawCount > 0 ? excludedCount / rawCount : 0;
      if (qualifiedCount < coffeeThreshold) return { weak: true, reason: "too_few_qualified" };
      if (noiseRatio > 0.5) return { weak: true, reason: "too_noisy" };
      if (strongCount === 0) return { weak: true, reason: "no_strong_match" };
      return { weak: false, reason: undefined as string | undefined };
    };

    if (fsqEnabled && fsqKey && COFFEE_CATEGORY_IDS.length > 0) {
      for (let idx = 0; idx < coffeeRadii.length; idx++) {
        const radius = coffeeRadii[idx];

        const canCall = await withinBudgets({
          supabaseAdmin,
          api: EXTERNAL_API.foursquare,
          dailyLimit: fsqDailyLimit,
          monthlyLimit: fsqMonthlyLimit,
        });
        if (!canCall) {
          weak = true;
          lastWeakReason = "budget_exceeded";
          break;
        }

        let raw: any[] = [];
        try {
          raw = await trackExternalCall(EXTERNAL_API.foursquare, "places_search", EXTERNAL_API_SURFACE.owls_eye_batch, () =>
            searchFoursquarePlaces({
              apiKey: fsqKey,
              apiVersion: fsqVersion,
              lat: venueLat,
              lng: venueLng,
              radiusMeters: radius,
              categoryIds: COFFEE_CATEGORY_IDS,
              limit,
              paramMode: "fsq_category_ids",
            })
          );
        } catch (err) {
          weak = true;
          lastWeakReason = err instanceof FoursquareHttpError ? (err.status === 429 ? "foursquare_rate_limited" : "foursquare_error") : "foursquare_error";
          break;
        }

        const tagged = tagAndFilterCoffeePlaces({
          provider: "foursquare",
          places: raw,
          venueLat,
          venueLng,
        });

        const qualified = tagged.filter((t) => t.qualified);
        const dedupedQualified: typeof qualified = [];
        const seen = new Set<string>();
        for (const q of qualified.sort((a, b) => a.distance_meters - b.distance_meters)) {
          if (seen.has(q.place_id)) continue;
          seen.add(q.place_id);
          dedupedQualified.push(q);
        }

        const weakCheck = isWeakCoffee(tagged, raw.length);
        weak = weakCheck.weak;
        lastWeakReason = weakCheck.reason;
        bestTagged = dedupedQualified;
        bestRadius = radius;

        fsqDebugRequests.push({
          endpoint: "https://places-api.foursquare.com/places/search",
          ll: `${venueLat},${venueLng}`,
          radius,
          limit,
          sort: "DISTANCE",
          param_mode: "fsq_category_ids",
          category_ids: COFFEE_CATEGORY_IDS,
          category: "coffee",
          result_count: raw.length,
          qualified_count: tagged.filter((t) => t.qualified).length,
          excluded_count: tagged.filter((t) => t.excluded).length,
          weak: weakCheck.weak,
          weak_reason: weakCheck.reason ?? null,
        });

        nearbyDebugQueries.push({
          category: "coffee",
          provider: "foursquare",
          radius_meters: radius,
          category_ids: COFFEE_CATEGORY_IDS,
          result_count: raw.length,
          kept_count: tagged.filter((t) => t.qualified).length,
          weak: weakCheck.weak,
          weak_reason: weakCheck.reason ?? null,
          items: tagged.map((t) => {
            const rawFsq = (raw as any[]).find((r) => r.fsq_place_id === t.provider_place_id);
            return {
              name: t.name,
              address: t.address,
              distance_meters: t.distance_meters,
              kept: t.qualified,
              reject_reason: t.excluded ? t.excluded_reason : !t.qualified ? "not_qualified" : undefined,
              reason_tags: t.reason_tags,
              strong_match: t.strong_match,
              fsq_place_id: t.provider_place_id,
              fsq_categories: (rawFsq?.categories ?? []).map((c: any) => ({
                id: String(c.fsq_category_id ?? ""),
                name: String(c.name ?? ""),
              })),
            };
          }),
        });

        if (!weak) break;
      }
    } else if (shouldFetch("coffee")) {
      lastWeakReason = !fsqEnabled ? "foursquare_disabled" : !fsqKey ? "missing_foursquare_key" : "missing_category_ids";
    }

    // Mark as attempted when we had category IDs and ran the logic (even if results are empty).
    if (fsqEnabled && fsqKey && COFFEE_CATEGORY_IDS.length > 0) attemptedCategories.add("coffee");

    if (!weak && bestTagged.length > 0) {
      // Store FSQ coffee results in owls_eye_nearby_food via the shared row builder below.
      (coffeeFinal as any) = {
        provider: "foursquare",
        radius: bestRadius,
        fallbackUsed: false,
        fallbackReason: null,
        places: bestTagged,
      };
      return;
    }

    // Google fallback only when needed.
    if (!googleFallbackEnabled || !apiKey) {
      (coffeeFinal as any) = {
        provider: "none",
        radius: bestRadius ?? coffeeRadii[coffeeRadii.length - 1],
        fallbackUsed: false,
        fallbackReason: lastWeakReason ?? "foursquare_low_quality",
        places: [],
      };
      return;
    }

    const canCallGoogle = await withinBudgets({
      supabaseAdmin,
      api: EXTERNAL_API.google_places,
      dailyLimit: googleDailyLimit,
      monthlyLimit: googleMonthlyLimit,
    });
    if (!canCallGoogle) {
      (coffeeFinal as any) = {
        provider: "none",
        radius: bestRadius ?? coffeeRadii[coffeeRadii.length - 1],
        fallbackUsed: false,
        fallbackReason: "budget_exceeded",
        places: [],
      };
      return;
    }

    const radius = coffeeRadii[coffeeRadii.length - 1];
    const googleRaw = await trackExternalCall(EXTERNAL_API.google_places, "nearby_search", EXTERNAL_API_SURFACE.owls_eye_batch, () =>
      fetchNearbyPlaces({
        ...baseOpts,
        type: "cafe",
        radiusMeters: radius,
        maxResultCount: 20,
      })
    );
    attemptedCategories.add("coffee");

    const taggedGoogle = tagAndFilterCoffeePlaces({
      provider: "google",
      places: googleRaw,
      venueLat,
      venueLng,
    });
    const qualifiedGoogle = taggedGoogle.filter((t) => t.qualified);

    nearbyDebugQueries.push({
      category: "coffee",
      provider: "google_fallback",
      radius_meters: radius,
      result_count: googleRaw.length,
      kept_count: qualifiedGoogle.length,
      weak: true,
      weak_reason: lastWeakReason ?? "foursquare_low_quality",
      items: taggedGoogle.map((t) => ({
        name: t.name,
        address: t.address,
        distance_meters: t.distance_meters,
        kept: t.qualified,
        reject_reason: t.excluded ? t.excluded_reason : !t.qualified ? "not_qualified" : undefined,
        reason_tags: t.reason_tags,
        strong_match: t.strong_match,
      })),
    });

    (coffeeFinal as any) = {
      provider: "google",
      radius,
      fallbackUsed: true,
      fallbackReason: lastWeakReason ?? "foursquare_low_quality",
      places: qualifiedGoogle,
    };
  };

  let coffeeFinal:
    | {
        provider: "foursquare" | "google" | "none";
        radius: number | undefined;
        fallbackUsed: boolean;
        fallbackReason: string | null;
        places: any[];
      }
    | null = null;

  await runCoffee();

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

  // Food debug entries are recorded when fetching (FSQ primary, Google fallback).
  if (shouldFetch("coffee") && apiKey) {
    // Coffee is now FSQ-primary; google-only debug entries are added only on fallback.
  }
  // Hotel debug entries are recorded when fetching (FSQ primary, Google fallback).

  let finalHotelResults = filteredHotelResults;
  // Last-resort fill: if Google fallback is enabled and hotels are still thin after the primary provider,
  // allow a single Google text-search fill to reach HOTEL_LIMIT. This is budget-guarded.
  if (shouldFetch("hotel") && finalHotelResults.length < HOTEL_LIMIT && googleFallbackEnabled && apiKey) {
    const firstProvider = String((finalHotelResults[0] as any)?.provider ?? "");
    if (firstProvider === "google") {
      const canCallGoogle = await withinBudgets({
        supabaseAdmin,
        api: EXTERNAL_API.google_places,
        dailyLimit: googleDailyLimit,
        monthlyLimit: googleMonthlyLimit,
      });
      if (canCallGoogle) {
        const hotelTextResults = await trackExternalCall(EXTERNAL_API.google_places, "nearby_search_text", EXTERNAL_API_SURFACE.owls_eye_batch, () =>
          fetchNearbyPlaces({
            ...baseOpts,
            type: "lodging",
            radiusMeters: HOTEL_RADIUS,
            maxResultCount: 20,
            forceTextSearch: true,
          })
        );
        const filteredTextHotels = hotelTextResults.filter(isHotelLike).map((g: any) => ({ ...g, provider: "google", provider_place_id: g.place_id }));
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
    }
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

  let sportingGoodsPlaces: TextPlace[] = [];
  const bigBoxPlaces: TextPlace[] = [];
  if (shouldFetch("sporting_goods")) {
    attemptedCategories.add("sporting_goods");

    try {
      const overpass = await searchOverpassSportingGoods({
        lat: venueLat,
        lng: venueLng,
        radiusMeters: SPORTING_GOODS_RADIUS,
        surface: EXTERNAL_API_SURFACE.owls_eye_batch,
      });

      const overpassPlaces: TextPlace[] = overpass
        .map((p) => ({
          place_id: `osm:${p.osm_type}:${p.osm_id}`,
          name: p.name,
          address: p.address ?? "",
          lat: p.lat,
          lng: p.lng,
          primaryType: "overpass_shop",
        }))
        .filter((p) => !!p.name && !SPORTING_EXCLUDE_RE.test(p.name));

      const deduped = dedupePlaces(overpassPlaces);
      sportingGoodsPlaces = sortByDistance(deduped).slice(0, SPORTING_GOODS_LIMIT);

      nearbyDebugQueries.push({
        category: "sporting_goods",
        provider: "overpass",
        radius_meters: SPORTING_GOODS_RADIUS,
        result_count: overpassPlaces.length,
        kept_count: sportingGoodsPlaces.length,
        items: sportingGoodsPlaces.map((item) => ({
          name: item.name,
          address: item.address ?? "",
          distance_meters: Math.round(haversineMeters({ lat: venueLat, lng: venueLng }, { lat: item.lat, lng: item.lng })),
          kept: true,
        })),
      });
    } catch (err) {
      console.warn("[owlseye] Overpass sporting goods failed", err);
    }

    // Fallback: single Google text search only on error/zero.
    if (sportingGoodsPlaces.length === 0 && googleFallbackEnabled && apiKey) {
      const canCallGoogle = await withinBudgets({
        supabaseAdmin,
        api: EXTERNAL_API.google_places,
        dailyLimit: googleDailyLimit,
        monthlyLimit: googleMonthlyLimit,
      });
      if (canCallGoogle) {
        try {
          const googleRaw = await searchPlacesText({
            apiKey,
            lat: venueLat,
            lng: venueLng,
            query: "sporting goods store",
            radiusMeters: SPORTING_GOODS_RADIUS,
            maxResultCount: 20,
          });
          const deduped = dedupePlaces(googleRaw);
          sportingGoodsPlaces = sortByDistance(deduped.filter(isSportingGoodsPlace)).slice(0, SPORTING_GOODS_LIMIT);
          nearbyDebugQueries.push({
            category: "sporting_goods",
            provider: "google_fallback",
            radius_meters: SPORTING_GOODS_RADIUS,
            result_count: googleRaw.length,
            kept_count: sportingGoodsPlaces.length,
            weak: true,
            weak_reason: "overpass_error_or_zero",
            items: sportingGoodsPlaces.map((item) => ({
              name: item.name,
              address: item.address ?? "",
              distance_meters: Math.round(haversineMeters({ lat: venueLat, lng: venueLng }, { lat: item.lat, lng: item.lng })),
              kept: true,
            })),
          });
        } catch (err) {
          console.warn("[owlseye] Sporting goods Google fallback failed", err);
        }
      }
    }
  }

  const toRows = (items: any[], category: "food" | "coffee" | "hotel", limit = limitPerCategory) =>
    items.slice(0, limit).map((item) => {
      const provider = (item?.provider === "foursquare" ? "foursquare" : "google") as "google" | "foursquare";
      const providerPlaceId = String(item?.provider_place_id ?? item?.place_id ?? "");
      const placeId = provider === "foursquare" ? `fsq:${providerPlaceId}` : String(item?.place_id ?? "");
      return {
        run_id: runId,
        place_id: placeId,
        name: item.name,
        category: classifyCategory(item.name, category),
        address: item.address ?? "",
        distance_meters:
          typeof item.distance_meters === "number"
            ? item.distance_meters
            : haversineMeters({ lat: venueLat, lng: venueLng }, { lat: item.lat, lng: item.lng }),
        maps_url: provider === "foursquare" ? `https://foursquare.com/v/${encodeURIComponent(providerPlaceId)}` : mapsUrl(providerPlaceId),
        is_sponsor: false,
        provider,
        provider_place_id: providerPlaceId,
        search_radius_meters: category === "hotel" ? HOTEL_RADIUS : radiusMeters,
        fallback_used: false,
        fallback_reason: null,
        reason_tags: null,
        place_latitude: item.lat,
        place_longitude: item.lng,
      };
    });

  const toCoffeeRows = () => {
    if (!shouldFetch("coffee")) return [] as any[];
    if (!coffeeFinal || coffeeFinal.provider === "none") return [] as any[];
    if (coffeeFinal.provider === "foursquare") {
      return (coffeeFinal.places ?? []).slice(0, limitPerCategory).map((p: any) => ({
        run_id: runId,
        place_id: p.place_id,
        name: p.name,
        category: "coffee",
        address: p.address ?? "",
        distance_meters: p.distance_meters,
        maps_url: `https://foursquare.com/v/${encodeURIComponent(p.provider_place_id)}`,
        is_sponsor: false,
        provider: "foursquare",
        provider_place_id: p.provider_place_id,
        search_radius_meters: coffeeFinal.radius ?? null,
        fallback_used: false,
        fallback_reason: null,
        reason_tags: p.reason_tags ?? ["coffee"],
        place_latitude: p.lat,
        place_longitude: p.lng,
      }));
    }

    // Google fallback: stored as normal google rows but with coffee category + fallback flags.
    return (coffeeFinal.places ?? []).slice(0, limitPerCategory).map((p: any) => ({
      run_id: runId,
      place_id: p.place_id,
      name: p.name,
      category: "coffee",
      address: p.address ?? "",
      distance_meters: p.distance_meters,
      maps_url: p.place_id.startsWith("g:") ? mapsUrl(p.provider_place_id) : mapsUrl(p.provider_place_id),
      is_sponsor: false,
      provider: "google",
      provider_place_id: p.provider_place_id,
      search_radius_meters: coffeeFinal.radius ?? null,
      fallback_used: true,
      fallback_reason: coffeeFinal.fallbackReason ?? "foursquare_low_quality",
      reason_tags: p.reason_tags ?? ["coffee"],
      place_latitude: p.lat,
      place_longitude: p.lng,
    }));
  };

  const toSportingRows = (items: TextPlace[]) =>
    items.slice(0, SPORTING_GOODS_LIMIT).map((item) => {
      const isOverpass = String(item.place_id ?? "").startsWith("osm:");
      const provider = (isOverpass ? "overpass" : "google") as "overpass" | "google";
      const providerPlaceId = String(item.place_id ?? "");
      const maps = isOverpass
        ? (() => {
            const parts = providerPlaceId.split(":"); // osm:<node|way>:<id>
            const osmType = parts[1];
            const osmId = parts[2];
            if (osmType === "way") return `https://www.openstreetmap.org/way/${encodeURIComponent(osmId ?? "")}`;
            return `https://www.openstreetmap.org/node/${encodeURIComponent(osmId ?? "")}`;
          })()
        : mapsUrl(providerPlaceId);
      return {
        run_id: runId,
        place_id: providerPlaceId,
        name: item.name,
        category: "sporting_goods" as const,
        address: item.address ?? "",
        distance_meters: haversineMeters({ lat: venueLat, lng: venueLng }, { lat: item.lat, lng: item.lng }),
        maps_url: maps,
        is_sponsor: false,
        provider,
        provider_place_id: providerPlaceId,
        search_radius_meters: SPORTING_GOODS_RADIUS,
        fallback_used: !isOverpass,
        fallback_reason: !isOverpass ? "overpass_error_or_zero" : null,
        reason_tags: null,
        place_latitude: item.lat,
        place_longitude: item.lng,
      };
    });

  const toEnhancedRows = (category: OwlEnhancedCategory) => {
    const meta = enhancedNearby[category];
    return (meta.places ?? []).slice(0, ENHANCED_LIMIT).map((p) => ({
      run_id: runId,
      place_id: p.place_id,
      name: p.name,
      category,
      address: p.address ?? "",
      distance_meters: p.distance_meters,
      maps_url: p.place_id.startsWith("g:")
        ? mapsUrl(p.provider_place_id)
        : `https://foursquare.com/v/${encodeURIComponent(p.provider_place_id)}`,
      is_sponsor: false,
      provider: p.place_id.startsWith("g:") ? "google" : "foursquare",
      provider_place_id: p.provider_place_id,
      search_radius_meters: meta.radius ?? null,
      fallback_used: meta.usedGoogleFallback && p.place_id.startsWith("g:"),
      fallback_reason: meta.usedGoogleFallback && p.place_id.startsWith("g:") ? meta.fallbackReason ?? null : null,
      reason_tags: p.reason_tags,
      place_latitude: p.lat,
      place_longitude: p.lng,
    }));
  };

  const sponsorRow = buildSponsorRow(runId);
  const coffeeKeptCount =
    coffeeFinal && coffeeFinal.provider !== "none"
      ? Math.min(Array.isArray(coffeeFinal.places) ? coffeeFinal.places.length : 0, limitPerCategory)
      : 0;

  const rows = [
    ...(sponsorRow ? [sponsorRow] : []),
    ...toRows(foodResults, "food"),
    ...toCoffeeRows(),
    ...toRows(finalHotelResults, "hotel", HOTEL_LIMIT),
    ...toSportingRows(sportingGoodsPlaces),
    ...(shouldFetch("quick_eats") ? toEnhancedRows("quick_eats") : []),
    ...(shouldFetch("hangouts") ? toEnhancedRows("hangouts") : []),
  ];
  const uniqueRows: typeof rows = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.place_id)) continue; // avoid conflicts if the same place appears in both categories/sponsor
    seen.add(row.place_id);
    if (!row.is_sponsor && row.category === "hotel" && looksLikeResidentialListing(row.name, row.address)) continue;
    uniqueRows.push(row);
  }
  if (force && !isTargetedRun) {
    // Forced full refresh: replace all stale nearby rows for the run.
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
      coffeeCount: coffeeKeptCount,
      hotelCount: Math.min(finalHotelResults.length, HOTEL_LIMIT),
      sportingGoodsCount: sportingGoodsPlaces.length,
      bigBoxFallbackCount: bigBoxPlaces.length,
      rawDebug: { queries: nearbyDebugQueries },
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

  // Targeted force refresh: delete only the categories being re-fetched so stale rows
  // don't survive alongside fresh results. Runs after confirming uniqueRows is non-empty
  // so we never wipe existing data on a zero-result re-run.
  if (force && isTargetedRun && categoriesToFetch && categoriesToFetch.length > 0) {
    for (const cat of categoriesToFetch) {
      const { error: clearError } = await (supabaseAdmin
        .from("owls_eye_nearby_food" as any) as any)
        .delete()
        .eq("run_id", runId)
        .eq("category", cat);
      if (clearError) {
        console.warn("[owlseye] Could not clear existing rows for targeted category refresh", { cat, clearError });
      }
    }
  }

  const { error } = await supabaseAdmin.from("owls_eye_nearby_food" as any).upsert(uniqueRows, {
    onConflict: "run_id,place_id",
  });

  if (error) {
    console.error("[owlseye] Nearby upsert failed", error);
    return { ok: false, message: error.message, rawDebug: { queries: nearbyDebugQueries } };
  }

  // Merge fetched categories into categories_fetched so targeted runs add to,
  // rather than overwrite, the existing record.
  try {
    // Only mark categories as fetched when we actually attempted to compute them.
    // This keeps "Filter by missing" accurate when budgets/keys disable a category.
    const justFetched = Array.from(attemptedCategories);
    const { data: runRow } = await supabaseAdmin
      .from("owls_eye_runs" as any)
      .select("categories_fetched")
      .eq("run_id", runId)
      .maybeSingle();
    const existing: string[] = Array.isArray(runRow?.categories_fetched) ? runRow.categories_fetched : [];
    const merged = Array.from(new Set([...existing, ...justFetched]));
    await supabaseAdmin
      .from("owls_eye_runs" as any)
      .update({ categories_fetched: merged })
      .eq("run_id", runId);
  } catch {
    // best-effort — does not affect the nearby rows already written
  }

  // Best-effort debug logging (admin pipeline only). Never block the run.
  // Store provider request summaries + small hangouts stats to help tuning.
  if (fsqDebugRequests.length > 0 || attemptedCategories.has("hangouts")) {
    try {
      const baseSelect = "outputs";
      let resp = await supabaseAdmin.from("owls_eye_runs" as any).select(baseSelect).eq("run_id", runId).maybeSingle();
      if (resp.error?.code === "42703" || resp.error?.code === "PGRST204") {
        resp = await supabaseAdmin.from("owls_eye_runs" as any).select(baseSelect).eq("id", runId).maybeSingle();
      }
      const existingOutputs = resp.data?.outputs ?? null;
      const outputs = existingOutputs && typeof existingOutputs === "object" ? existingOutputs : {};
      const debug = outputs.debug && typeof outputs.debug === "object" ? outputs.debug : {};
      const prev = Array.isArray(debug.foursquare_requests) ? debug.foursquare_requests : [];
      const merged = [...prev, ...fsqDebugRequests].slice(-50);
      const nextOutputs = {
        ...outputs,
        debug: {
          ...debug,
          foursquare_requests: merged,
          hangouts_stats: attemptedCategories.has("hangouts") ? hangoutsStats : debug.hangouts_stats,
        },
      };

      const updatePayload: Record<string, any> = { outputs: nextOutputs };
      let update = await supabaseAdmin.from("owls_eye_runs" as any).update(updatePayload).eq("run_id", runId);
      if (update.error?.code === "42703" || update.error?.code === "PGRST204") {
        update = await supabaseAdmin.from("owls_eye_runs" as any).update(updatePayload).eq("id", runId);
      }
    } catch {
      // swallow
    }
  }

  return {
    ok: true,
    message: "inserted",
    foodCount: Math.min(foodResults.length, limitPerCategory),
    coffeeCount: coffeeKeptCount,
    hotelCount: Math.min(finalHotelResults.length, HOTEL_LIMIT),
    sportingGoodsCount: sportingGoodsPlaces.length,
    bigBoxFallbackCount: bigBoxPlaces.length,
    rawDebug: { queries: nearbyDebugQueries },
  };
}

export default upsertNearbyForRun;
