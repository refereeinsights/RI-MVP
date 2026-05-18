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

// Tags that protect a candidate from name-pattern-based junk suppression.
// If a place has already earned one of these tags through category/name matching,
// we do not suppress it solely because its name looks like a handle or odd string.
const STRONG_INDOOR_OVERRIDE_TAGS = new Set([
  "brewery", "taproom", "pizza", "food_court", "arcade",
  "bowling", "indoor_play", "mini_golf", "amusement", "known_keeper",
]);

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

function hasStrongIndoorOverrideTag(tags: string[]): boolean {
  return tags.some((t) => STRONG_INDOOR_OVERRIDE_TAGS.has(t));
}

function looksLikeHangoutJunk(name: string, fsqCategoryIds: string[], tags: string[]): boolean {
  // Hard junk — always suppress regardless of tags.
  if (JUNK_RESIDENCE_RE.test(name)) return true;
  if (JUNK_FICTIONAL_RE.test(name)) return true;
  if (JUNK_PERSON_RE.test(name)) return true;
  // Warehouse: suppress only when no allowed hangout category is present.
  if (/\bwarehouse\b/i.test(name)) {
    const hasAllowedCategory = fsqCategoryIds.some((id) => HANGOUT_CATEGORY_IDS.includes(id));
    if (!hasAllowedCategory) return true;
  }

  // Name-pattern suppression: only when no strong indoor override tag is present.
  // If the place has earned a strong indoor tag (brewery, pizza, arcade, etc.) through
  // category/name matching, do not suppress it solely due to naming style.
  if (!hasStrongIndoorOverrideTag(tags)) {
    // All-lowercase handle: "bobosneh", "nadszone" (before trim)
    if (/^[a-z0-9_]{4,20}$/.test(name)) return true;
    // CamelCase portmanteau with no spaces: "NadsZone"
    if (/^[A-Za-z][a-z]{2,}[A-Z][A-Za-z]{2,}$/.test(name)) return true;
    // Short odd-apostrophe prefix: "A 'sode"
    if (/^[A-Za-z]{1,3}\s*'[a-z]/i.test(name)) return true;
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

      // Pass reasonTagsBase so strong indoor tags (brewery, pizza, arcade, etc.) can
      // override broad name-pattern suppression for valid businesses like "Morretti's".
      const isJunk = args.category === "hangouts" && looksLikeHangoutJunk(name, fsqCategoryIds, reasonTagsBase);

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

export function hangoutsRankTier(place: TaggedPlace): number {
  const tags = new Set(place.reason_tags ?? []);

  // Tier 1: Brewery/taproom with food signal.
  if (tags.has("brewery") && !tags.has("brewery_no_food_signal")) return 1;

  // Tier 2: Pizza, Food Court.
  if (tags.has("pizza") || tags.has("food_court")) return 2;

  // Tier 3: Strong indoor activities.
  if (
    tags.has("arcade") ||
    tags.has("bowling") ||
    tags.has("indoor_play") ||
    tags.has("mini_golf") ||
    tags.has("amusement") ||
    tags.has("known_keeper")
  ) return 3;

  // Tier 4: Brewery/taproom without food signal.
  if (tags.has("brewery_no_food_signal")) return 4;

  // Tier 5: Sports Bar with food signal.
  if (tags.has("sports_bar") && !tags.has("sports_bar_no_food")) return 5;

  // Tier 6: Pub with food signal.
  if (tags.has("pub") && !tags.has("pub_no_food")) return 6;

  // Tier 7: Ice Cream (included for future use; no active FSQ category or tag path currently).
  if (tags.has("ice_cream")) return 7;

  // Tier 8: Park/Playground.
  if (tags.has("park") || tags.has("playground")) return 8;

  // Tier 9: Mall.
  if (tags.has("mall")) return 9;

  // Tier 10: Other (science, sports_bar/pub without food signal, etc.).
  return 10;
}

// Returns true for the strong indoor categories that should anchor the hangouts section.
// Parks, playgrounds, malls, brewery-without-food, sports bars/pubs without food,
// and other lower-fit results return false.
export function isStrongIndoorHangout(place: TaggedPlace): boolean {
  const tags = new Set(place.reason_tags ?? []);
  if (tags.has("brewery") && !tags.has("brewery_no_food_signal")) return true;
  if (tags.has("pizza")) return true;
  if (tags.has("food_court")) return true;
  if (tags.has("arcade")) return true;
  if (tags.has("bowling")) return true;
  if (tags.has("indoor_play")) return true;
  if (tags.has("mini_golf")) return true;
  if (tags.has("amusement")) return true;
  return false;
}

// Applies anti-padding caps and determines lowCoverage based on strong indoor scarcity.
//
// Rules:
//   0 strong indoor   → empty output, lowCoverage=true
//   1–2 strong indoor → strong indoor + at most 1 tier-4–6 lower-fit backfill
//                       (brewery-no-food, sports_bar+food, pub+food only;
//                        parks/malls/other excluded), lowCoverage=true
//   3+ strong indoor  → strong indoor + at most 1 lower-fit backfill (any tier),
//                       park/playground cap max 1 combined, lowCoverage=false
export function applyHangoutCaps(places: TaggedPlace[]): {
  places: TaggedPlace[];
  lowCoverage: boolean;
} {
  const strongIndoor = places.filter(isStrongIndoorHangout);
  const strongIndoorCount = strongIndoor.length;

  if (strongIndoorCount === 0) {
    return { places: [], lowCoverage: true };
  }

  const lowerFit = places.filter((p) => !isStrongIndoorHangout(p));

  if (strongIndoorCount < 3) {
    // Thin coverage: allow at most 1 backfill from tiers 4–6 only.
    // Parks (tier 8), malls (tier 9), and other (tier 10) are excluded until
    // strong indoor coverage reaches 3.
    const selected: TaggedPlace[] = [];
    for (const p of lowerFit) {
      if (selected.length >= 1) break;
      const tier = hangoutsRankTier(p);
      if (tier >= 4 && tier <= 6) selected.push(p);
    }
    return { places: [...strongIndoor, ...selected], lowCoverage: true };
  }

  // 3+ strong indoor: allow at most 1 lower-fit backfill; park+playground cap max 1.
  let parkCount = 0;
  const selectedLowerFit: TaggedPlace[] = [];

  for (const p of lowerFit) {
    if (selectedLowerFit.length >= 1) break;
    const tags = new Set(p.reason_tags ?? []);
    if (tags.has("park") || tags.has("playground")) {
      if (parkCount >= 1) continue;
      parkCount++;
    }
    selectedLowerFit.push(p);
  }

  return {
    places: [...strongIndoor, ...selectedLowerFit],
    lowCoverage: false,
  };
}

// Filters strong indoor places by FSQ rating, lowering the threshold when coverage is thin.
// Lower-fit places (parks, malls, brewery-no-food, etc.) always pass through unchanged —
// they're handled by applyHangoutCaps which decides whether to include them based on the
// strong indoor count. Applying the rating gate to lower-fit was causing parks (null rating
// → always pass) to survive while rated strong indoor places got filtered, leaving
// applyHangoutCaps with 0 strong indoor and an empty result.
export function applyHangoutRatingFilter(places: TaggedPlace[]): TaggedPlace[] {
  const strongIndoor = places.filter(isStrongIndoorHangout);
  const lowerFit = places.filter((p) => !isStrongIndoorHangout(p));

  const ratedPrimary = strongIndoor.filter(
    (p) => typeof p.rating !== "number" || p.rating >= HANGOUT_PRIMARY_MIN_RATING
  );
  if (ratedPrimary.length >= HANGOUT_THIN_COVERAGE_THRESHOLD) {
    return [...ratedPrimary, ...lowerFit];
  }

  // Thin strong indoor coverage: lower the threshold and retry.
  const ratedFallback = strongIndoor.filter(
    (p) => typeof p.rating !== "number" || p.rating >= HANGOUT_FALLBACK_MIN_RATING
  );
  return [...(ratedFallback.length > 0 ? ratedFallback : strongIndoor), ...lowerFit];
}
