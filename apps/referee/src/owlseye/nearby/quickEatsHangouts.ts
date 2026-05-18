import haversineMeters from "@/lib/geo/haversineMeters";
import type { FsqPlaceResult } from "./foursquarePlaces";
import { HANGOUT_CATEGORY_IDS, HANGOUT_SUPPRESSION_CATEGORY_IDS, QUICK_EATS_CATEGORY_IDS } from "../foursquareCategories";

export type OwlEnhancedCategory = "quick_eats" | "hangouts";

export type TaggedPlace = {
  provider_place_id: string;
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance_meters: number;
  reason_tags: string[];
  qualified: boolean;
  strong_match: boolean;
  excluded: boolean;
  excluded_reason?: string;
  rating?: number | null;
};

export const HANGOUT_PRIMARY_MIN_RATING = 7.0;
export const HANGOUT_FALLBACK_MIN_RATING = 6.0;
export const HANGOUT_THIN_COVERAGE_THRESHOLD = 3;

const NORMALIZE_RE = /[^\w\s&]/g;

function norm(input: string) {
  return String(input || "")
    .toLowerCase()
    .replace(NORMALIZE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Hard excludes: always noise for our use-cases.
const HARD_EXCLUDE_RE =
  /\b(nordstrom|lush|lego store|department store|boutique|law office|attorney|courthouse|city hall|government|storage|self storage|u-haul|office)\b/i;
const NIGHTLIFE_HARD_EXCLUDE_RE =
  /\b(speakeasy|nightclub|strip club|hookah|cocktail|wine bar|21\+|adults?\s*only|adult\s*only)\b/i;
const NIGHTLIFE_SOFT_EXCLUDE_RE =
  /\b(tasting room|lounge)\b/i;
const FINE_DINING_EXCLUDE_RE =
  /\b(steakhouse|fine dining|prix fixe|tasting menu|omakase)\b/i;
const THEATER_EXCLUDE_RE = /\b(amc|cinema|movie theater|theatre|concert hall)\b/i;
const GROCERY_EXCLUDE_RE = /\b(grocery|convenience|7-eleven|7 eleven|gas station)\b/i;
const DOG_PARK_EXCLUDE_RE =
  /\b(dog park|off leash|off-leash|offleash|dog run|pet park|pet exercise)\b/i;
const JOEY_EXCLUDE_RE = /\bjoey\b/i;

// Junk name suppression: private residences, fictional/media names, unintelligible entities.
const JUNK_RESIDENCE_RE = /\b(residence|apartment|apt|trailer)\b|\$residence/i;
const JUNK_FICTIONAL_RE = /\b(deus ex|cybertron|human revolution|madden)\b/i;
const JUNK_PERSON_RE = /^[A-Z][a-z]+\s[A-Z][a-z]+'s?$/;

// Food/casual signal for brewery/taproom/sports bar/pub quality check.
const FOOD_SIGNAL_NAME_RE =
  /\b(kitchen|grill|grille|pizza|pizzeria|eats|food|brewpub|brew pub|public house|ale house|tap house)\b/i;
const FOOD_SIGNAL_FSQ_CATEGORY_RE =
  /\b(pizza|restaurant|food court|food truck|diner|grill|kitchen)\b/i;

const QUICK_EATS_POSITIVE_RE =
  /\b(subway|jimmy john|jersey mike|firehouse|potbelly|panera|chipotle|qdoba|mod pizza|domino|pizza|pizzeria|deli|sandwich|wrap|burrito|taco|fast food|burger|fried chicken|bagel|hot dog|drive[- ]?thru|takeout|take-out|to go|grab and go|bakery)\b/i;
const QUICK_EATS_NEGATIVE_RE =
  /\b(bistro|martini|taproom|brewhouse|brewery|bar)\b/i;

const HANGOUT_POSITIVE_RE =
  /\b(brewery|brewhouse|taproom|sports.?bar|pub|arcade|bowling|mini.?golf|putt|science center|museum|park|playground|mall|riverfront|family|kids|outdoor|patio|spacious|beer garden|indoor.?play|amusement|food.?court|food.?hall|pizza|pizzeria)\b/i;

const HANGOUT_STRONG_RE =
  /\b(brewery|brewhouse|taproom|sports.?bar|arcade|bowling|mini.?golf|science center|park|playground|mall|flatstick|beer garden|indoor.?play|amusement|food.?court|pizza|pizzeria)\b/i;

function isExcludedBase(name: string) {
  if (HARD_EXCLUDE_RE.test(name)) return { excluded: true, reason: "hard_exclude" };
  if (NIGHTLIFE_HARD_EXCLUDE_RE.test(name)) return { excluded: true, reason: "nightlife_hard" };
  if (NIGHTLIFE_SOFT_EXCLUDE_RE.test(name)) return { excluded: true, reason: "nightlife_soft" };
  if (FINE_DINING_EXCLUDE_RE.test(name)) return { excluded: true, reason: "fine_dining" };
  if (GROCERY_EXCLUDE_RE.test(name)) return { excluded: true, reason: "grocery" };
  if (JOEY_EXCLUDE_RE.test(name)) return { excluded: true, reason: "joey_style" };
  return { excluded: false, reason: undefined };
}

function looksLikeHangoutJunk(name: string, fsqCategoryIds: string[]): boolean {
  if (JUNK_RESIDENCE_RE.test(name)) return true;
  if (JUNK_FICTIONAL_RE.test(name)) return true;
  if (JUNK_PERSON_RE.test(name)) return true;
  // Warehouse: suppress only when no allowed hangout category is present.
  if (/\bwarehouse\b/i.test(name)) {
    const hasAllowedCategory = fsqCategoryIds.some((id) => HANGOUT_CATEGORY_IDS.includes(id));
    if (!hasAllowedCategory) return true;
  }
  return false;
}

function isFsqOnlySuppressed(fsqCategoryIds: string[]): boolean {
  if (fsqCategoryIds.length === 0) return false;
  return (
    fsqCategoryIds.every((id) => HANGOUT_SUPPRESSION_CATEGORY_IDS.includes(id)) &&
    !fsqCategoryIds.some((id) => HANGOUT_CATEGORY_IDS.includes(id))
  );
}

function hasFoodSignal(h: string, fsqCategoryNames: string[], popularity?: number | null): boolean {
  if (FOOD_SIGNAL_NAME_RE.test(h)) return true;
  if (fsqCategoryNames.some((n) => FOOD_SIGNAL_FSQ_CATEGORY_RE.test(n))) return true;
  if (typeof popularity === "number" && popularity > 0.7) return true;
  return false;
}

function tagsForQuickEats(h: string) {
  const tags: string[] = [];
  if (/\b(sandwich|sub)\b/i.test(h)) tags.push("sandwich");
  if (/\bdeli\b/i.test(h)) tags.push("deli");
  if (/\b(pizza|pizzeria)\b/i.test(h)) tags.push("pizza");
  if (/\bfast food\b/i.test(h)) tags.push("fast_food");
  if (/\bfast casual\b/i.test(h)) tags.push("fast_casual");
  if (/\b(burrito|chipotle|qdoba)\b/i.test(h)) tags.push("burrito_bowl");
  if (/\btaco\b/i.test(h)) tags.push("tacos");
  if (/\bburger\b/i.test(h)) tags.push("fast_food");
  if (/\bfried chicken\b/i.test(h)) tags.push("fast_food");
  if (/\bhot dog\b/i.test(h)) tags.push("fast_food");
  if (/\bwrap\b/i.test(h)) tags.push("wraps");
  if (/\b(bakery|bagel)\b/i.test(h)) tags.push("bakery_grab_go");
  if (/\b(subway|jimmy john|jersey mike|firehouse|potbelly|panera|chipotle|qdoba|mod pizza)\b/i.test(h)) tags.push("chain_reliable");
  return tags;
}

function tagsForHangouts(h: string) {
  const tags: string[] = [];
  if (/\b(brewery|brewhouse|taproom)\b/i.test(h)) tags.push("brewery");
  if (/\bbeer garden\b/i.test(h)) tags.push("brewery");
  if (/\bsports.?bar\b/i.test(h)) tags.push("sports_bar");
  if (/\bpub\b/i.test(h)) tags.push("pub");
  if (/\b(pizza|pizzeria)\b/i.test(h)) tags.push("pizza");
  if (/\barcade\b/i.test(h)) tags.push("arcade");
  if (/\bbowling\b/i.test(h)) tags.push("bowling");
  if (/\bmini.?golf|putt\b/i.test(h)) tags.push("mini_golf");
  if (/\bindoor.?play\b/i.test(h)) tags.push("indoor_play");
  if (/\bamusement\b/i.test(h)) tags.push("amusement");
  if (/\bfood.?court|food.?hall\b/i.test(h)) tags.push("food_court");
  if (/\bscience center|museum\b/i.test(h)) tags.push("science");
  if (/\bpark\b/i.test(h)) tags.push("park");
  if (/\bplayground\b/i.test(h)) tags.push("playground");
  if (/\bmall\b/i.test(h)) tags.push("mall");
  if (/\bfamily\b/i.test(h)) tags.push("family");
  if (/\bkids?\b/i.test(h)) tags.push("kids");
  if (/\boutdoor\b/i.test(h)) tags.push("outdoor");
  if (/\bpatio\b/i.test(h)) tags.push("patio");
  if (/\bspacious\b/i.test(h)) tags.push("spacious");
  if (/\bflatstick\b/i.test(h)) tags.push("known_keeper");
  return tags;
}

export function tagAndFilterEnhancedPlaces(args: {
  category: OwlEnhancedCategory;
  provider: "foursquare" | "google";
  places: Array<
    | FsqPlaceResult
    | {
        place_id: string;
        name: string;
        address: string;
        lat: number;
        lng: number;
        business_status?: string;
      }
  >;
  venueLat: number;
  venueLng: number;
}): TaggedPlace[] {
  return args.places
    .map((p) => {
      const providerPlaceId = "fsq_place_id" in p ? p.fsq_place_id : p.place_id;
      const name = p.name;
      const address = p.address ?? "";
      const lat = p.lat;
      const lng = p.lng;
      if (!providerPlaceId || !name || typeof lat !== "number" || typeof lng !== "number") return null;

      // Provider closure signals (best-effort; only applied when present).
      const isClosed = (() => {
        if ("fsq_place_id" in p) {
          const status = String(p.status ?? "").toLowerCase();
          const bucket = String(p.closed_bucket ?? "").toLowerCase();
          const reason = String(p.closed_reason ?? "").toLowerCase();
          if (p.is_closed === true) return true;
          if (p.permanently_closed === true || p.temporarily_closed === true) return true;
          if (status && /closed|inactive|permanent/i.test(status)) return true;
          if (bucket && /closed|inactive|permanent/i.test(bucket)) return true;
          if (reason && /closed|inactive|permanent/i.test(reason)) return true;
          return false;
        }
        const businessStatus = String((p as any)?.business_status ?? "").toUpperCase();
        if (businessStatus === "CLOSED_PERMANENTLY" || businessStatus === "CLOSED_TEMPORARILY") return true;
        return false;
      })();

      const fsqCategoryNames = (() => {
        if (!("fsq_place_id" in p)) return [] as string[];
        return (p.categories ?? []).map((c) => String(c?.name ?? "")).filter(Boolean);
      })();

      const fsqCategoryIds = (() => {
        if (!("fsq_place_id" in p)) return [] as string[];
        return (p.categories ?? []).map((c) => String(c?.fsq_category_id ?? "")).filter(Boolean);
      })();

      const fsqPopularity = ("fsq_place_id" in p && typeof (p as any).popularity === "number")
        ? (p as any).popularity as number
        : null;

      const fsqRating = ("fsq_place_id" in p && typeof (p as any).rating === "number")
        ? (p as any).rating as number
        : null;

      // Include FSQ category names so brand names match via their category.
      const h = norm(`${name} ${address} ${fsqCategoryNames.join(" ")}`);
      const reasonTagsBase = args.category === "quick_eats" ? tagsForQuickEats(h) : tagsForHangouts(h);

      const breweryMatch =
        args.category === "hangouts" &&
        (reasonTagsBase.includes("brewery") ||
          /\b(brewery|brewhouse|taproom|brewpub|brew pub)\b/i.test(h) ||
          fsqCategoryNames.some((n) => /\b(brewery|brewhouse|taproom|brewpub|brew pub)\b/i.test(n)));

      const breweryHasFoodSignal = breweryMatch && hasFoodSignal(h, fsqCategoryNames, fsqPopularity);

      const sportsBarMatch =
        args.category === "hangouts" &&
        (reasonTagsBase.includes("sports_bar") ||
          /\bsports.?bar\b/i.test(h) ||
          fsqCategoryNames.some((n) => /\bsports.?bar\b/i.test(n)));

      const sportsBarHasFoodSignal = sportsBarMatch && hasFoodSignal(h, fsqCategoryNames, fsqPopularity);

      const pubMatch =
        args.category === "hangouts" &&
        (reasonTagsBase.includes("pub") ||
          fsqCategoryNames.some((n) => /\bpub\b/i.test(n)));

      const pubHasFoodSignal = pubMatch && hasFoodSignal(h, fsqCategoryNames, fsqPopularity);

      const dogParkMatch =
        args.category === "hangouts" &&
        (DOG_PARK_EXCLUDE_RE.test(h) ||
          fsqCategoryNames.some((n) => DOG_PARK_EXCLUDE_RE.test(norm(n))));

      const isJunk = args.category === "hangouts" && looksLikeHangoutJunk(name, fsqCategoryIds);

      const isFsqSuppressed =
        args.category === "hangouts" && "fsq_place_id" in p && isFsqOnlySuppressed(fsqCategoryIds);

      const baseEx = isExcludedBase(h);
      // Brewery/sports-bar override: do not exclude on "soft nightlife" keywords (tasting room/lounge).
      const baseExcluded =
        baseEx.excluded && !((breweryMatch || sportsBarMatch) && baseEx.reason === "nightlife_soft");

      const theaterExcluded = THEATER_EXCLUDE_RE.test(h);
      const excluded = isClosed || dogParkMatch || baseExcluded || theaterExcluded || isJunk || isFsqSuppressed;

      // Build reason tags, adding modifier tags for food-signal demotion.
      const reasonTagsMutable: string[] =
        args.category === "hangouts"
          ? breweryMatch || sportsBarMatch
            ? Array.from(new Set([...reasonTagsBase, "hangout_primary"]))
            : [...reasonTagsBase]
          : [...reasonTagsBase];

      if (args.category === "hangouts") {
        if (breweryMatch && !breweryHasFoodSignal) reasonTagsMutable.push("brewery_no_food_signal");
        if (sportsBarMatch && !sportsBarHasFoodSignal) reasonTagsMutable.push("sports_bar_no_food");
        if (pubMatch && !pubHasFoodSignal) reasonTagsMutable.push("pub_no_food");
      }

      const reasonTags = reasonTagsMutable;

      const quickEatsSignalsOk =
        args.category !== "quick_eats" ||
        (QUICK_EATS_POSITIVE_RE.test(h) && !QUICK_EATS_NEGATIVE_RE.test(h));

      const hangoutSignalsOk =
        args.category !== "hangouts" || HANGOUT_POSITIVE_RE.test(h);

      const fsqCategoryGateOk = (() => {
        if (args.category !== "quick_eats") return true;
        if (!("fsq_place_id" in p)) return true;
        const ids = (p.categories ?? []).map((c) => c.fsq_category_id).filter(Boolean);
        return ids.some((id) => QUICK_EATS_CATEGORY_IDS.includes(id));
      })();

      const breweryQualifiedOverride =
        args.category === "hangouts" && breweryMatch && !excluded && !NIGHTLIFE_HARD_EXCLUDE_RE.test(h);

      const sportsBarQualifiedOverride =
        args.category === "hangouts" && sportsBarMatch && sportsBarHasFoodSignal && !excluded && !NIGHTLIFE_HARD_EXCLUDE_RE.test(h);

      const qualified =
        breweryQualifiedOverride ||
        sportsBarQualifiedOverride ||
        (!excluded &&
          reasonTags.length > 0 &&
          quickEatsSignalsOk &&
          hangoutSignalsOk &&
          fsqCategoryGateOk);

      const strongMatch =
        args.category === "quick_eats"
          ? ["sandwich", "deli", "fast_food", "pizza", "burrito_bowl", "fast_casual", "tacos"].some((t) =>
              reasonTags.includes(t)
            )
          : (breweryMatch && breweryHasFoodSignal) ||
            reasonTags.includes("indoor_play") ||
            reasonTags.includes("amusement") ||
            reasonTags.includes("food_court") ||
            reasonTags.includes("pizza") ||
            HANGOUT_STRONG_RE.test(h) ||
            reasonTags.includes("known_keeper");

      const meters = haversineMeters(
        { lat: args.venueLat, lng: args.venueLng },
        { lat, lng }
      );

      return {
        provider_place_id: providerPlaceId,
        place_id: `${args.provider === "foursquare" ? "fsq" : "g"}:${providerPlaceId}`,
        name,
        address,
        lat,
        lng,
        distance_meters: Math.round(meters),
        reason_tags: isClosed ? [...reasonTags, "closed"] : reasonTags,
        qualified,
        strong_match: strongMatch,
        excluded,
        excluded_reason: excluded
          ? isClosed
            ? (String((p as any)?.business_status ?? "").toUpperCase() === "CLOSED_TEMPORARILY" || ("fsq_place_id" in p && p.temporarily_closed)
                ? "temporarily_closed"
                : "permanently_closed")
            : dogParkMatch
            ? "dog_park"
            : isJunk || isFsqSuppressed
            ? "junk"
            : baseEx.reason ?? (theaterExcluded ? "theater" : "excluded")
          : undefined,
        rating: fsqRating,
      } satisfies TaggedPlace;
    })
    .filter(Boolean) as TaggedPlace[];
}

export function hangoutsRankTier(place: TaggedPlace) {
  const tags = new Set(place.reason_tags ?? []);

  // Tier 1: Brewery/taproom with food signal.
  if (tags.has("brewery") && !tags.has("brewery_no_food_signal")) return 1;

  // Tier 2: Pizza, Food Court.
  if (tags.has("pizza") || tags.has("food_court")) return 2;

  // Tier 3: Activity places, brewery without food signal, sports bar with food signal.
  if (
    tags.has("arcade") ||
    tags.has("bowling") ||
    tags.has("indoor_play") ||
    tags.has("mini_golf") ||
    tags.has("amusement") ||
    tags.has("known_keeper")
  ) return 3;
  if (tags.has("brewery_no_food_signal")) return 3;
  if (tags.has("sports_bar") && !tags.has("sports_bar_no_food")) return 3;

  // Tier 4: Pub with food signal.
  if (tags.has("pub") && !tags.has("pub_no_food")) return 4;

  // Tier 5: Science center/museum.
  if (tags.has("science")) return 5;

  // Tier 6: Park/playground, sports bar or pub without food signal.
  if (tags.has("park") || tags.has("playground")) return 6;
  if (tags.has("sports_bar") || tags.has("pub")) return 6;

  // Tier 7: Mall.
  if (tags.has("mall")) return 7;

  // Tier 8: Other.
  return 8;
}

export function applyHangoutCaps(places: TaggedPlace[]): TaggedPlace[] {
  // Suppress parks/playgrounds entirely if there are 5+ strong indoor results (tiers 1–4).
  const strongIndoorCount = places.filter((p) => hangoutsRankTier(p) <= 4).length;
  const suppressParks = strongIndoorCount >= 5;

  let parkCount = 0;
  return places.filter((p) => {
    const tags = new Set(p.reason_tags ?? []);
    if (tags.has("park") || tags.has("playground")) {
      if (suppressParks) return false;
      parkCount++;
      return parkCount <= 1;
    }
    return true;
  });
}

export function applyHangoutRatingFilter(places: TaggedPlace[]): {
  places: TaggedPlace[];
  lowCoverage: boolean;
} {
  const ratedPrimary = places.filter(
    (p) => typeof p.rating !== "number" || p.rating >= HANGOUT_PRIMARY_MIN_RATING
  );
  if (ratedPrimary.length >= HANGOUT_THIN_COVERAGE_THRESHOLD) {
    return { places: ratedPrimary, lowCoverage: false };
  }

  // Thin coverage: lower the threshold and retry with already-fetched candidates.
  const ratedFallback = places.filter(
    (p) => typeof p.rating !== "number" || p.rating >= HANGOUT_FALLBACK_MIN_RATING
  );
  return {
    places: ratedFallback.length > 0 ? ratedFallback : places,
    lowCoverage: true,
  };
}
