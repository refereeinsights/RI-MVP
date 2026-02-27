export const DEMO_STARFIRE_VENUE_ID = "226a949e-5bea-406d-93f3-f8df1ab8b83a";

export type VenueReviewChoiceRow = {
  restrooms: string | null;
  parking_distance: string | null;
  parking_convenience_score: number | null;
};

export type OwlsEyeDemoScores = {
  foodVendors: boolean;
  coffeeVendors: boolean;
  vendorScore: string;
  restrooms: string;
  restroomCleanliness: string;
  shade: string;
  parkingLabel: string;
  reviewCount: number;
  updatedLabel: string;
};

function mode(values: Array<string | null | undefined>) {
  if (!values.length) return null;
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  if (!counts.size) return null;
  let best: string | null = null;
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function formatAvg(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} / 5`;
}

function formatVendorScore(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value > 5) return `${Math.round(value)} / 100`;
  const normalized = Math.round(((value - 1) / 4) * 100);
  return `${value.toFixed(1)} / 5 (${normalized}/100)`;
}

function parkingLabelFromDistance(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "close") return "Close";
  if (normalized === "medium") return "Walk";
  if (normalized === "far") return "Hike";
  return null;
}

function parkingLabelFromAverage(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 4) return "Close";
  if (value >= 3) return "Walk";
  return "Hike";
}

function formatUpdated(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function buildOwlsEyeDemoScores(input: {
  nearbyCounts: { food: number; coffee: number; hotels: number };
  vendor_score_avg: number | null | undefined;
  restroom_cleanliness_avg: number | null | undefined;
  shade_score_avg: number | null | undefined;
  parking_convenience_score_avg: number | null | undefined;
  review_count: number | null | undefined;
  reviews_last_updated_at: string | null | undefined;
  reviewChoices?: VenueReviewChoiceRow[] | null;
}): OwlsEyeDemoScores {
  const choices = input.reviewChoices ?? [];
  const restroomMode = mode(
    choices
      .map((row) => row.restrooms?.trim())
      .filter((value): value is string => Boolean(value))
  );
  const parkingMode = mode(
    choices
      .map((row) => parkingLabelFromDistance(row.parking_distance))
      .filter((value): value is "Close" | "Walk" | "Hike" => Boolean(value))
  );

  return {
    foodVendors: input.nearbyCounts.food > 0,
    coffeeVendors: input.nearbyCounts.coffee > 0,
    vendorScore: formatVendorScore(input.vendor_score_avg),
    restrooms: restroomMode ?? "—",
    restroomCleanliness: formatAvg(input.restroom_cleanliness_avg),
    shade: formatAvg(input.shade_score_avg),
    parkingLabel: parkingMode ?? parkingLabelFromAverage(input.parking_convenience_score_avg),
    reviewCount: Number(input.review_count ?? 0),
    updatedLabel: formatUpdated(input.reviews_last_updated_at),
  };
}
