// Verified Foursquare category ids for Owl's Eye (v1).
//
// Populated via the discovery script:
// `FSQ_API_KEY=... npx tsx scripts/foursquare_category_discovery.ts`
//
// Keep this file small and explicit — do not include broad categories unless
// discovery proves they are consistently relevant and low-noise.

export const QUICK_EATS_CATEGORY_IDS: string[] = [
  // NOTE: Verified via `scripts/foursquare_category_discovery.ts` against the new
  // `places-api.foursquare.com` endpoint (April 2026).
  //
  // Keep this list intentionally narrow to avoid noisy "restaurant" results.
  "4bf58dd8d48988d16e941735", // Fast Food Restaurant
  "4bf58dd8d48988d1ca941735", // Pizzeria
  "4bf58dd8d48988d1c5941735", // Sandwich Spot
  "4bf58dd8d48988d146941735", // Deli
  "4bf58dd8d48988d16a941735", // Bakery
  "4bf58dd8d48988d16c941735", // Burger Joint
  "4bf58dd8d48988d151941735", // Taco Restaurant
  "4bf58dd8d48988d153941735", // Burrito Restaurant
  "4d4ae6fc7a7b7dea34424761", // Fried Chicken Joint
  "4bf58dd8d48988d179941735", // Bagel Shop
];

export const HANGOUT_CATEGORY_IDS: string[] = [
  // Family-friendly hangouts / "between games" downtime.
  //
  // We intentionally avoid broad categories like "Restaurant" here and rely on
  // targeted activity categories + our scoring/exclusion logic.
  "50327c8591d4c4b30a586d5d", // Brewery
  "4bf58dd8d48988d1e1931735", // Arcade
  "4bf58dd8d48988d1e4931735", // Bowling Alley
  "52e81612bcbc57f1066b79eb", // Mini Golf Course
  "4bf58dd8d48988d1c9941735", // Ice Cream Parlor
  "4bf58dd8d48988d163941735", // Park
  "4bf58dd8d48988d1e7941735", // Playground
  "4bf58dd8d48988d1fd941735", // Shopping Mall
  "4bf58dd8d48988d117941735", // Beer Garden
];

export const COFFEE_CATEGORY_IDS: string[] = [
  // Coffee shop / cafe discovery:
  // Use the new Places API’s `fsq_category_ids` filter (not `categories`) and
  // keep the list narrow so coffee doesn’t drift into retail/noise.
  //
  // NOTE: If this category ever returns noisy results, tighten this list by
  // re-running `scripts/foursquare_category_discovery.ts` focused on coffee.
  "4bf58dd8d48988d1e0931735", // Coffee Shop
];

// Food discovery (FSQ-primary; Google as fallback-only).
// Priority order (requested): American, Diner, New American, Italian, Mexican.
// Keep Restaurant as a last-resort fill category (can be noisy).
export const FOOD_CATEGORY_IDS: string[] = [
  "4bf58dd8d48988d14e941735", // American Restaurant
  "4bf58dd8d48988d147941735", // Diner
  "4bf58dd8d48988d157941735", // New American Restaurant
  "4bf58dd8d48988d110941735", // Italian Restaurant
  "4bf58dd8d48988d1c1941735", // Mexican Restaurant
  "4d4b7105d754a06374d81259", // Restaurant (broad, last resort)
];

// Lodging discovery (FSQ-primary; Google as fallback-only).
// Priority order (requested): hotel first.
export const LODGING_CATEGORY_IDS: string[] = [
  "4bf58dd8d48988d1fa931735", // Hotel
  "5bae9231bedf3950379f89cb", // Inn
  "63be6904847c3692a84b9c27", // Lodge
  "4bf58dd8d48988d1fb931735", // Motel
];
