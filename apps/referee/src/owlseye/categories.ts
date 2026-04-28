// The canonical set of Owl's Eye search categories for a complete venue run.
// Add new categories here when they are ready to ship; the admin page and
// backfill script use this list to surface venues that are missing any entry.
export const CURRENT_OWL_CATEGORIES = [
  "food",
  "coffee",
  "hotel",
  "sporting_goods",
  "quick_eats",
  "hangouts",
] as const;

export type OwlCategory = (typeof CURRENT_OWL_CATEGORIES)[number];

export const OWL_CATEGORY_LABELS: Record<string, string> = {
  food: "Food",
  coffee: "Coffee",
  hotel: "Hotels",
  sporting_goods: "Sporting Goods",
  quick_eats: "Quick Eats",
  hangouts: "Family-Friendly Hangouts",
};
