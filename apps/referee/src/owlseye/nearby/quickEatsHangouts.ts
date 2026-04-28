import haversineMeters from "@/lib/geo/haversineMeters";
import type { FsqPlaceResult } from "./foursquarePlaces";

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
const NIGHTLIFE_EXCLUDE_RE =
  /\b(speakeasy|nightclub|strip club|hookah|cocktail|wine bar|tasting room|lounge)\b/i;
const FINE_DINING_EXCLUDE_RE =
  /\b(steakhouse|fine dining|prix fixe|tasting menu|omakase)\b/i;
const THEATER_EXCLUDE_RE = /\b(amc|cinema|movie theater|theatre|concert hall)\b/i;
const GROCERY_EXCLUDE_RE = /\b(grocery|convenience|7-eleven|7 eleven|gas station)\b/i;

// "JOEY-style" upscale chain exclusion signal — keep intentionally narrow and tunable.
const JOEY_EXCLUDE_RE = /\bjoey\b/i;

const QUICK_EATS_POSITIVE_RE =
  /\b(subway|jimmy john|jersey mike|firehouse|potbelly|panera|chipotle|qdoba|mod pizza|domino|pizza|pizzeria|deli|sandwich|wrap|burrito|taco|fast food|drive[- ]?thru|takeout|take-out|to go|grab and go|bakery)\b/i;
const QUICK_EATS_NEGATIVE_RE =
  /\b(bistro|martini|taproom|brewhouse|brewery|bar)\b/i;

const HANGOUT_POSITIVE_RE =
  /\b(brewery|brewhouse|taproom|arcade|bowling|mini golf|putt|science center|museum|park|playground|mall|riverfront|family|kids|outdoor|patio|spacious)\b/i;

const HANGOUT_STRONG_RE =
  /\b(brewery|brewhouse|taproom|arcade|bowling|mini golf|science center|park|playground|mall|flatstick)\b/i;

function isExcludedBase(name: string) {
  if (HARD_EXCLUDE_RE.test(name)) return { excluded: true, reason: "hard_exclude" };
  if (NIGHTLIFE_EXCLUDE_RE.test(name)) return { excluded: true, reason: "nightlife" };
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
  if (/\bwrap\b/i.test(h)) tags.push("wraps");
  if (/\bbakery\b/i.test(h)) tags.push("bakery_grab_go");
  if (/\b(subway|jimmy john|jersey mike|firehouse|potbelly|panera|chipotle|qdoba|mod pizza)\b/i.test(h)) tags.push("chain_reliable");
  return tags;
}

function tagsForHangouts(h: string) {
  const tags: string[] = [];
  if (/\b(brewery|brewhouse|taproom)\b/i.test(h)) tags.push("brewery");
  if (/\b(pizza|pizzeria)\b/i.test(h)) tags.push("pizza");
  if (/\barcade\b/i.test(h)) tags.push("arcade");
  if (/\bbowling\b/i.test(h)) tags.push("bowling");
  if (/\bmini golf|putt\b/i.test(h)) tags.push("mini_golf");
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

      const h = norm(`${name} ${address}`);
      const baseEx = isExcludedBase(h);
      // Theaters are excluded by default; can be surfaced later via explicit allow logic.
      const theaterExcluded = THEATER_EXCLUDE_RE.test(h);
      const excluded = baseEx.excluded || theaterExcluded;

      const reasonTags =
        args.category === "quick_eats" ? tagsForQuickEats(h) : tagsForHangouts(h);

      const quickEatsSignalsOk =
        args.category !== "quick_eats" ||
        (QUICK_EATS_POSITIVE_RE.test(h) && !QUICK_EATS_NEGATIVE_RE.test(h));

      const hangoutSignalsOk =
        args.category !== "hangouts" || HANGOUT_POSITIVE_RE.test(h);

      const qualified =
        !excluded &&
        reasonTags.length > 0 &&
        quickEatsSignalsOk &&
        hangoutSignalsOk;

      const strongMatch =
        args.category === "quick_eats"
          ? ["sandwich", "deli", "fast_food", "pizza", "burrito_bowl", "fast_casual"].some((t) =>
              reasonTags.includes(t)
            )
          : HANGOUT_STRONG_RE.test(h) || reasonTags.includes("known_keeper");

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
        reason_tags: reasonTags,
        qualified,
        strong_match: strongMatch,
        excluded,
        excluded_reason: excluded ? baseEx.reason ?? (theaterExcluded ? "theater" : "excluded") : undefined,
      } satisfies TaggedPlace;
    })
    .filter(Boolean) as TaggedPlace[];
}

