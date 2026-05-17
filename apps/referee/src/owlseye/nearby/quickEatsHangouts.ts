import haversineMeters from "@/lib/geo/haversineMeters";
import type { FsqPlaceResult } from "./foursquarePlaces";
import { QUICK_EATS_CATEGORY_IDS } from "../foursquareCategories";

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
};

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
// Nightlife excludes:
// - "Hard": always excluded, even if the place is otherwise a hangout.
// - "Soft": excluded unless the place is clearly a brewery/taproom/brewpub.
const NIGHTLIFE_HARD_EXCLUDE_RE =
  /\b(speakeasy|nightclub|strip club|hookah|cocktail|wine bar)\b/i;
const NIGHTLIFE_SOFT_EXCLUDE_RE =
  /\b(tasting room|lounge)\b/i;
const FINE_DINING_EXCLUDE_RE =
  /\b(steakhouse|fine dining|prix fixe|tasting menu|omakase)\b/i;
const THEATER_EXCLUDE_RE = /\b(amc|cinema|movie theater|theatre|concert hall)\b/i;
const GROCERY_EXCLUDE_RE = /\b(grocery|convenience|7-eleven|7 eleven|gas station)\b/i;
const DOG_PARK_EXCLUDE_RE =
  /\b(dog park|off leash|off-leash|offleash|dog run|pet park|pet exercise)\b/i;

// "JOEY-style" upscale chain exclusion signal — keep intentionally narrow and tunable.
const JOEY_EXCLUDE_RE = /\bjoey\b/i;

const QUICK_EATS_POSITIVE_RE =
  /\b(subway|jimmy john|jersey mike|firehouse|potbelly|panera|chipotle|qdoba|mod pizza|domino|pizza|pizzeria|deli|sandwich|wrap|burrito|taco|fast food|burger|fried chicken|bagel|hot dog|drive[- ]?thru|takeout|take-out|to go|grab and go|bakery)\b/i;
const QUICK_EATS_NEGATIVE_RE =
  /\b(bistro|martini|taproom|brewhouse|brewery|bar)\b/i;

const HANGOUT_POSITIVE_RE =
  /\b(brewery|brewhouse|taproom|sports.?bar|pub|arcade|bowling|mini golf|putt|science center|museum|park|playground|mall|riverfront|family|kids|outdoor|patio|spacious|ice cream|beer garden)\b/i;

const HANGOUT_STRONG_RE =
  /\b(brewery|brewhouse|taproom|sports.?bar|arcade|bowling|mini golf|science center|park|playground|mall|flatstick|ice cream|beer garden)\b/i;

function isExcludedBase(name: string) {
  if (HARD_EXCLUDE_RE.test(name)) return { excluded: true, reason: "hard_exclude" };
  if (NIGHTLIFE_HARD_EXCLUDE_RE.test(name)) return { excluded: true, reason: "nightlife_hard" };
  if (NIGHTLIFE_SOFT_EXCLUDE_RE.test(name)) return { excluded: true, reason: "nightlife_soft" };
  if (FINE_DINING_EXCLUDE_RE.test(name)) return { excluded: true, reason: "fine_dining" };
  if (GROCERY_EXCLUDE_RE.test(name)) return { excluded: true, reason: "grocery" };
  if (JOEY_EXCLUDE_RE.test(name)) return { excluded: true, reason: "joey_style" };
  return { excluded: false, reason: undefined };
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
  if (/\bmini golf|putt\b/i.test(h)) tags.push("mini_golf");
  if (/\bscience center|museum\b/i.test(h)) tags.push("science");
  if (/\bpark\b/i.test(h)) tags.push("park");
  if (/\bplayground\b/i.test(h)) tags.push("playground");
  if (/\bmall\b/i.test(h)) tags.push("mall");
  if (/\bfamily\b/i.test(h)) tags.push("family");
  if (/\bice cream\b/i.test(h)) tags.push("kids");
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

      // Include FSQ category names so brand names (e.g. "Jack in the Box", "McDonald's")
      // match via their category ("Fast Food Restaurant") rather than requiring keyword in name.
      const h = norm(`${name} ${address} ${fsqCategoryNames.join(" ")}`);
      const reasonTagsBase = args.category === "quick_eats" ? tagsForQuickEats(h) : tagsForHangouts(h);

      const breweryMatch =
        args.category === "hangouts" &&
        (reasonTagsBase.includes("brewery") ||
          /\b(brewery|brewhouse|taproom|brewpub|brew pub)\b/i.test(h) ||
          fsqCategoryNames.some((n) => /\b(brewery|brewhouse|taproom|brewpub|brew pub)\b/i.test(n)));

      const sportsBarMatch =
        args.category === "hangouts" &&
        (reasonTagsBase.includes("sports_bar") ||
          /\bsports.?bar\b/i.test(h) ||
          fsqCategoryNames.some((n) => /\bsports.?bar\b/i.test(n)));

      const dogParkMatch =
        args.category === "hangouts" &&
        (DOG_PARK_EXCLUDE_RE.test(h) ||
          fsqCategoryNames.some((n) => DOG_PARK_EXCLUDE_RE.test(norm(n))));

      const baseEx = isExcludedBase(h);
      // Brewery/sports-bar override: do not exclude on "soft nightlife" keywords (tasting room/lounge).
      const baseExcluded =
        baseEx.excluded && !((breweryMatch || sportsBarMatch) && baseEx.reason === "nightlife_soft");

      // Theaters are excluded by default; can be surfaced later via explicit allow logic.
      const theaterExcluded = THEATER_EXCLUDE_RE.test(h);
      const excluded = isClosed || dogParkMatch || baseExcluded || theaterExcluded;

      const reasonTags =
        args.category === "hangouts"
          ? breweryMatch || sportsBarMatch
            ? Array.from(new Set([...reasonTagsBase, "hangout_primary"]))
            : reasonTagsBase
          : reasonTagsBase;

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
        args.category === "hangouts" && (breweryMatch || sportsBarMatch) && !excluded && !NIGHTLIFE_HARD_EXCLUDE_RE.test(h);

      const qualified =
        breweryQualifiedOverride ||
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
          : breweryMatch || HANGOUT_STRONG_RE.test(h) || reasonTags.includes("known_keeper");

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
            : baseEx.reason ?? (theaterExcluded ? "theater" : "excluded")
          : undefined,
      } satisfies TaggedPlace;
    })
    .filter(Boolean) as TaggedPlace[];
}

export function hangoutsRankTier(place: TaggedPlace) {
  const tags = new Set(place.reason_tags ?? []);
  if (tags.has("brewery")) return 1;
  if (tags.has("sports_bar") || tags.has("pizza") || tags.has("known_keeper")) return 2;
  if (tags.has("arcade") || tags.has("bowling") || tags.has("mini_golf") || tags.has("pub")) return 3;
  if (tags.has("science")) return 4;
  if (tags.has("park") || tags.has("playground")) return 5;
  if (tags.has("mall")) return 6;
  return 7;
}

export function applyHangoutCaps(places: TaggedPlace[]): TaggedPlace[] {
  let parkCount = 0;
  return places.filter((p) => {
    const tags = new Set(p.reason_tags ?? []);
    if (tags.has("park") || tags.has("playground")) {
      parkCount++;
      return parkCount <= 1;
    }
    return true;
  });
}
