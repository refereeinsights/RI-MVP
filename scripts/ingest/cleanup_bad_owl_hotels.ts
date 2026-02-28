import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const CHUNK = 1000;

type NearbyHotelRow = {
  id: string;
  run_id: string | null;
  place_id: string | null;
  name: string | null;
  category: string | null;
  address: string | null;
};

const HOTEL_INCLUDE_RE = /\b(hotel|motel|inn|resort|suite|suites|lodge)\b/i;
const HOTEL_EXCLUDE_RE =
  /\b(storage|self storage|mobile home|rv|campground|trailer|home park|apartment|apartments|condo|condominiums?|residential|residence|residences|retreat|getaway|holiday home|vacation rental|vacation rentals|private room|entire home|whole home|townhome|townhouse|single family|multi family|student housing|senior living|corporate housing|furnished rental|property management|leasing office|lease office|realty|real estate|homes for rent|villa rental)\b/i;
const HOTEL_BRAND_RE =
  /\b(hyatt|hilton|marriott|sheraton|westin|wyndham|fairfield|hampton|holiday inn|best western|comfort inn|motel 6|studio 6|extended stay america|residence inn|homewood suites|home2 suites|springhill suites|towneplace suites|aloft|tru by hilton|la quinta|days inn|super 8|courtyard|drury|radisson|quality inn|doubletree|embassy suites|staybridge|avid hotel)\b/i;
const VACATION_RENTAL_RE =
  /\b(home|house|studio|townhome|townhouse|cabin|villa|loft|bungalow|chalet|guesthouse|guest house|airbnb|vrbo)\b/i;
const RESTAURANT_RE =
  /\b(bbq|barbecue|grill|cafe|café|coffee|espresso|pizza|burger|kitchen|taqueria|taco|restaurant|eatery|bistro|diner|pub|brewery|bakery|steakhouse|sushi|ramen|noodle|pho|cantina|gelato|ice cream)\b/i;
const HOTEL_AMBIGUOUS_SIGNAL_RE = /\b(suites?|resort|lodge|inn|stay|retreat|villa|club)\b/i;

function clean(value: string | null | undefined) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : "";
}

function looksBadHotel(row: NearbyHotelRow) {
  const name = clean(row.name);
  const address = clean(row.address);
  const haystack = `${name} ${address}`.toLowerCase();
  const hasBrandSignal = HOTEL_BRAND_RE.test(haystack);
  const hasHotelSignal = HOTEL_INCLUDE_RE.test(haystack) || hasBrandSignal;
  const hasExcludedSignal = HOTEL_EXCLUDE_RE.test(haystack);
  const hasRentalSignal = VACATION_RENTAL_RE.test(haystack);
  const hasRestaurantSignal = RESTAURANT_RE.test(haystack);
  const hasAmbiguousSignal = HOTEL_AMBIGUOUS_SIGNAL_RE.test(haystack);

  if (hasRestaurantSignal) return true;
  if ((hasExcludedSignal || hasRentalSignal) && !hasBrandSignal) return true;
  if (!hasHotelSignal && (hasExcludedSignal || hasRentalSignal || hasRestaurantSignal)) return true;
  if (hasAmbiguousSignal && !hasHotelSignal && !hasBrandSignal) return true;
  if (!hasHotelSignal && !hasBrandSignal) return true;
  return false;
}

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const rows: NearbyHotelRow[] = [];
  for (let from = 0; ; from += CHUNK) {
    const to = from + CHUNK - 1;
    const { data, error } = await supabase
      .from("owls_eye_nearby_food" as any)
      .select("id,run_id,place_id,name,category,address")
      .eq("category", "hotel")
      .range(from, to);
    if (error) throw error;
    const chunk = (data ?? []) as NearbyHotelRow[];
    rows.push(...chunk);
    if (chunk.length < CHUNK) break;
  }
  const badRows = rows.filter(looksBadHotel);

  let deleted = 0;
  if (APPLY && badRows.length) {
    const ids = badRows.map((row) => row.id).filter(Boolean);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { error: deleteError } = await supabase.from("owls_eye_nearby_food" as any).delete().in("id", chunk);
      if (deleteError) throw deleteError;
      deleted += chunk.length;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        hotel_rows_scanned: rows.length,
        bad_hotel_rows: badRows.length,
        deleted,
        sample: badRows.slice(0, 25).map((row) => ({
          id: row.id,
          run_id: row.run_id,
          name: row.name,
          address: row.address,
        })),
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
