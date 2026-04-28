import haversineMeters from "@/lib/geo/haversineMeters";
import fetchNearbyPlaces from "@/lib/google/nearbySearch";
import { EXTERNAL_API, EXTERNAL_API_SURFACE, trackExternalCall } from "@/lib/trackExternalCall";
import { CURRENT_OWL_CATEGORIES } from "../categories";
import { QUICK_EATS_CATEGORY_IDS, HANGOUT_CATEGORY_IDS } from "../foursquareCategories";
import { FoursquareHttpError, searchFoursquarePlaces } from "./foursquarePlaces";
import { tagAndFilterEnhancedPlaces, type OwlEnhancedCategory } from "./quickEatsHangouts";

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

  const baseOpts = { lat: venueLat, lng: venueLng, radiusMeters, apiKey };
  let foodResults: any[] = [];
  let coffeeResults: any[] = [];
  let hotelResults: any[] = [];
  const attemptedCategories = new Set<string>();
  if (apiKey) {
    try {
      [foodResults, coffeeResults, hotelResults] = await Promise.all([
        shouldFetch("food")
          ? trackExternalCall(EXTERNAL_API.google_places, "nearby_search", EXTERNAL_API_SURFACE.owls_eye_batch, () =>
              fetchNearbyPlaces({ ...baseOpts, type: "restaurant" })
            )
          : Promise.resolve([]),
        shouldFetch("coffee")
          ? trackExternalCall(EXTERNAL_API.google_places, "nearby_search", EXTERNAL_API_SURFACE.owls_eye_batch, () =>
              fetchNearbyPlaces({ ...baseOpts, type: "cafe" })
            )
          : Promise.resolve([]),
        shouldFetch("hotel")
          ? trackExternalCall(EXTERNAL_API.google_places, "nearby_search", EXTERNAL_API_SURFACE.owls_eye_batch, () =>
              fetchNearbyPlaces({
                ...baseOpts,
                type: "lodging",
                radiusMeters: HOTEL_RADIUS,
                maxResultCount: 50,
              })
            )
          : Promise.resolve([]),
      ]);
      if (shouldFetch("food")) attemptedCategories.add("food");
      if (shouldFetch("coffee")) attemptedCategories.add("coffee");
      if (shouldFetch("hotel")) attemptedCategories.add("hotel");
    } catch (err) {
      console.error("[owlseye] Nearby fetch failed", err);
      return { ok: false, message: err instanceof Error ? err.message : "nearby_fetch_failed" };
    }
  } else if (shouldFetch("food") || shouldFetch("coffee") || shouldFetch("hotel")) {
    console.warn("[owlseye] Missing GOOGLE_PLACES_API_KEY; skipping nearby fetch");
  }

  const enhancedNearby: Record<OwlEnhancedCategory, { places: ReturnType<typeof tagAndFilterEnhancedPlaces>; usedGoogleFallback: boolean; fallbackReason?: string; radius?: number }> =
    {
      quick_eats: { places: [], usedGoogleFallback: false },
      hangouts: { places: [], usedGoogleFallback: false },
    };

  const fsqDebugRequests: Array<Record<string, any>> = [];

  const fsqKey = process.env.FSQ_API_KEY || process.env.FOURSQUARE_API_KEY || "";
  const fsqEnabled = (process.env.FOURSQUARE_ENABLED ?? "true").toLowerCase() === "true";
  const fsqVersion = process.env.FOURSQUARE_API_VERSION || "2025-06-17";
  const fsqDailyLimit = Math.max(0, Number(process.env.FOURSQUARE_DAILY_CALL_LIMIT ?? 500));
  const fsqMonthlyLimit = Math.max(0, Number(process.env.FOURSQUARE_MONTHLY_CALL_LIMIT ?? 35000));

  const googleFallbackEnabled = (process.env.GOOGLE_FALLBACK_FOR_OWLS_EYE_ENABLED ?? "true").toLowerCase() === "true";
  const googleDailyLimit = Math.max(0, Number(process.env.GOOGLE_FALLBACK_DAILY_CALL_LIMIT ?? 100));
  const googleMonthlyLimit = Math.max(0, Number(process.env.GOOGLE_FALLBACK_MONTHLY_CALL_LIMIT ?? 3000));

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
    if (!force && isRunFresh && runHasCategory(category)) return;

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

        const weakCheck = isWeak(tagged, raw.length, isInitial);
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
  };

  await Promise.all([runEnhanced("quick_eats"), runEnhanced("hangouts")]);

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
  if (shouldFetch("hotel") && finalHotelResults.length < HOTEL_LIMIT) {
    const hotelTextResults = await trackExternalCall(EXTERNAL_API.google_places, "nearby_search_text", EXTERNAL_API_SURFACE.owls_eye_batch, () => fetchNearbyPlaces({
      ...baseOpts,
      type: "lodging",
      radiusMeters: HOTEL_RADIUS,
      maxResultCount: 20,
      forceTextSearch: true,
    }));
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
  if (shouldFetch("sporting_goods") && apiKey) try {
    attemptedCategories.add("sporting_goods");
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
    if (shouldFetch("sporting_goods")) console.warn("[owlseye] Sporting goods search failed", err);
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
      provider: "google",
      provider_place_id: item.place_id,
      search_radius_meters: category === "hotel" ? HOTEL_RADIUS : radiusMeters,
      fallback_used: false,
      fallback_reason: null,
      reason_tags: null,
      place_latitude: item.lat,
      place_longitude: item.lng,
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
      provider: "google",
      provider_place_id: item.place_id,
      search_radius_meters: SPORTING_GOODS_RADIUS,
      fallback_used: category === "big_box_fallback",
      fallback_reason: category === "big_box_fallback" ? "sporting_goods_no_results" : null,
      reason_tags: null,
      place_latitude: item.lat,
      place_longitude: item.lng,
    }));

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

  const rows = [
    ...(sponsorRow ? [sponsorRow] : []),
    ...toRows(foodResults, "food"),
    ...toRows(coffeeResults, "coffee"),
    ...toRows(finalHotelResults, "hotel", HOTEL_LIMIT),
    ...toSportingRows(sportingGoodsPlaces, "sporting_goods"),
    ...toSportingRows(bigBoxPlaces, "big_box_fallback"),
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
  if (fsqDebugRequests.length > 0) {
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
      const nextOutputs = { ...outputs, debug: { ...debug, foursquare_requests: merged } };

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
    coffeeCount: Math.min(coffeeResults.length, limitPerCategory),
    hotelCount: Math.min(finalHotelResults.length, HOTEL_LIMIT),
    sportingGoodsCount: sportingGoodsPlaces.length,
    bigBoxFallbackCount: bigBoxPlaces.length,
  };
}

export default upsertNearbyForRun;
