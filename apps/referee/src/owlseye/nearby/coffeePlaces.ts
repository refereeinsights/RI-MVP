import haversineMeters from "@/lib/geo/haversineMeters";
import type { FsqPlaceResult } from "./foursquarePlaces";
import { COFFEE_CATEGORY_IDS } from "../foursquareCategories";

export type CoffeeTaggedPlace = {
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

const HARD_EXCLUDE_RE =
  /\b(nordstrom|lush|lego store|department store|boutique|law office|attorney|courthouse|city hall|government|storage|self storage|u-haul|office)\b/i;
const NIGHTLIFE_EXCLUDE_RE =
  /\b(speakeasy|nightclub|strip club|hookah|cocktail|wine bar|tasting room|lounge)\b/i;
const THEATER_EXCLUDE_RE = /\b(amc|cinema|movie theater|theatre|concert hall)\b/i;
const GROCERY_EXCLUDE_RE = /\b(grocery|convenience|7-eleven|7 eleven|gas station)\b/i;

const COFFEE_POSITIVE_RE =
  /\b(coffee|espresso|cafe|café|latte|cappuccino|mocha|roastery|starbucks|dutch bros|peet'?s|caribou)\b/i;
const COFFEE_NEGATIVE_RE =
  /\b(equipment|supply|wholesale|office|restaurant|steakhouse|fine dining)\b/i;

function isClosedFsq(p: FsqPlaceResult) {
  const status = String(p.status ?? "").toLowerCase();
  const bucket = String(p.closed_bucket ?? "").toLowerCase();
  const reason = String(p.closed_reason ?? "").toLowerCase();
  if (p.is_closed === true) return { closed: true, reason: "permanently_closed" };
  if (p.permanently_closed === true) return { closed: true, reason: "permanently_closed" };
  if (p.temporarily_closed === true) return { closed: true, reason: "temporarily_closed" };
  if (status && /closed|inactive|permanent/i.test(status)) return { closed: true, reason: "permanently_closed" };
  if (bucket && /closed|inactive|permanent/i.test(bucket)) return { closed: true, reason: "permanently_closed" };
  if (reason && /closed|inactive|permanent/i.test(reason)) return { closed: true, reason: "permanently_closed" };
  return { closed: false, reason: undefined as string | undefined };
}

function hasCoffeeCategoryId(p: FsqPlaceResult) {
  const ids = (p.categories ?? []).map((c) => c.fsq_category_id).filter(Boolean);
  return ids.some((id) => COFFEE_CATEGORY_IDS.includes(id));
}

export function tagAndFilterCoffeePlaces(args: {
  provider: "foursquare" | "google";
  places: Array<
    | FsqPlaceResult
    | {
        place_id: string;
        name: string;
        address: string;
        lat: number;
        lng: number;
        types?: string[];
        primaryType?: string;
      }
  >;
  venueLat: number;
  venueLng: number;
}): CoffeeTaggedPlace[] {
  return args.places
    .map((p) => {
      const providerPlaceId = "fsq_place_id" in p ? p.fsq_place_id : p.place_id;
      const name = p.name;
      const address = (p as any)?.address ?? "";
      const lat = (p as any)?.lat;
      const lng = (p as any)?.lng;
      if (!providerPlaceId || !name || typeof lat !== "number" || typeof lng !== "number") return null;

      const closure = "fsq_place_id" in p ? isClosedFsq(p) : { closed: false, reason: undefined as string | undefined };

      const h = norm(`${name} ${address}`);
      const excluded =
        closure.closed ||
        HARD_EXCLUDE_RE.test(h) ||
        NIGHTLIFE_EXCLUDE_RE.test(h) ||
        THEATER_EXCLUDE_RE.test(h);

      const reasonTags: string[] = [];
      if (COFFEE_POSITIVE_RE.test(h)) reasonTags.push("coffee");
      if (/\b(starbucks|dutch bros|peet|caribou)\b/i.test(h)) reasonTags.push("chain_reliable");

      const fsqCategoryGateOk = (() => {
        if (args.provider !== "foursquare") return true;
        if (!("fsq_place_id" in p)) return true;
        return hasCoffeeCategoryId(p);
      })();

      const qualified =
        !excluded &&
        reasonTags.length > 0 &&
        !COFFEE_NEGATIVE_RE.test(h) &&
        fsqCategoryGateOk;

      const strongMatch = qualified && reasonTags.includes("coffee");

      const meters = haversineMeters({ lat: args.venueLat, lng: args.venueLng }, { lat, lng });

      return {
        provider_place_id: providerPlaceId,
        place_id: `${args.provider === "foursquare" ? "fsq" : "g"}:${providerPlaceId}`,
        name,
        address,
        lat,
        lng,
        distance_meters: Math.round(meters),
        reason_tags: closure.closed ? [...reasonTags, "closed"] : reasonTags,
        qualified,
        strong_match: strongMatch,
        excluded,
        excluded_reason: excluded ? closure.reason ?? "excluded" : undefined,
      } satisfies CoffeeTaggedPlace;
    })
    .filter(Boolean) as CoffeeTaggedPlace[];
}

