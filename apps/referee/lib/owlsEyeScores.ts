export const DEMO_STARFIRE_VENUE_ID = "226a949e-5bea-406d-93f3-f8df1ab8b83a";

export type VenueReviewChoiceRow = {
  restrooms: string | null;
  parking_distance: string | null;
  parking_convenience_score: number | null;
  food_vendors?: boolean | null;
  coffee_vendors?: boolean | null;
  bring_field_chairs?: boolean | null;
  player_parking_fee?: number | null;
  parking_notes?: string | null;
  seating_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type OwlsEyeDemoScores = {
  foodVendors: "Yes" | "No" | "—";
  coffeeVendors: "Yes" | "No" | "—";
  playerParkingFee: string;
  vendorScore: string;
  restrooms: string;
  restroomCleanliness: string;
  shade: string;
  parkingLabel: string;
  parkingNotes: string;
  bringFieldChairs: "Yes" | "No" | "—";
  seatingNotes: string;
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

function modeBoolean(values: Array<boolean | null | undefined>): "Yes" | "No" | "—" {
  let yes = 0;
  let no = 0;
  for (const value of values) {
    if (value === true) yes += 1;
    if (value === false) no += 1;
  }
  if (!yes && !no) return "—";
  return yes >= no ? "Yes" : "No";
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) < 0.005) return "Free";
  const isInteger = Math.abs(value % 1) < 0.000001;
  return isInteger ? `$${Math.round(value)}` : `$${value.toFixed(2)}`;
}

function formatNoteLine(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 60 ? `${compact.slice(0, 57)}...` : compact;
}

function parseParkingFeeString(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (/^free$/i.test(trimmed)) return "Free";
  const numeric = Number(trimmed.replace(/[$,\s]/g, ""));
  if (Number.isFinite(numeric) && /^\$?\s*[0-9]+(\.[0-9]{1,2})?$/.test(trimmed)) {
    return formatCurrency(numeric);
  }
  return trimmed;
}

function modeNumber(values: number[]) {
  if (!values.length) return null;
  const counts = new Map<number, number>();
  for (const value of values) {
    const normalized = Math.round(value * 100) / 100;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function sortByMostRecent(rows: VenueReviewChoiceRow[]) {
  return [...rows].sort((a, b) => {
    const aTs = Date.parse(a.updated_at ?? a.created_at ?? "");
    const bTs = Date.parse(b.updated_at ?? b.created_at ?? "");
    const aSafe = Number.isFinite(aTs) ? aTs : 0;
    const bSafe = Number.isFinite(bTs) ? bTs : 0;
    return bSafe - aSafe;
  });
}

function latestTwoNoteLines(rows: VenueReviewChoiceRow[], field: "parking_notes" | "seating_notes") {
  const lines = sortByMostRecent(rows)
    .map((row) => (row[field] ?? "").trim())
    .filter((value) => value.length > 0)
    .slice(0, 2)
    .map(formatNoteLine);
  return lines.length ? lines.join("\n") : "—";
}

function parkingFeeRange(rows: VenueReviewChoiceRow[]) {
  const values = rows
    .map((row) => row.player_parking_fee)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (Math.abs(min - max) < 0.000001) return formatCurrency(max);
  return `${formatCurrency(max)} - ${formatCurrency(min)}`;
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

export function mostSelectedBringFieldChairs(values: Array<boolean | null | undefined>, fallback?: boolean | null): "Yes" | "No" | "—" {
  const modeValue = modeBoolean(values);
  if (modeValue !== "—") return modeValue;
  if (fallback === true) return "Yes";
  if (fallback === false) return "No";
  return "—";
}

export function buildOwlsEyeDemoScores(input: {
  nearbyCounts: { food: number; coffee: number; hotels: number };
  vendor_score_avg: number | null | undefined;
  restroom_cleanliness_avg: number | null | undefined;
  shade_score_avg: number | null | undefined;
  parking_convenience_score_avg: number | null | undefined;
  tournament_player_parking_fee?: string | null | undefined;
  venue_player_parking_fee?: string | null | undefined;
  parking_notes?: string | null | undefined;
  venue_bring_field_chairs?: boolean | null | undefined;
  seating_notes?: string | null | undefined;
  review_count: number | null | undefined;
  reviews_last_updated_at: string | null | undefined;
  reviewChoices?: VenueReviewChoiceRow[] | null;
}): OwlsEyeDemoScores {
  const choices = input.reviewChoices ?? [];
  const restroomMode = mode(choices.map((row) => row.restrooms?.trim()).filter((value): value is string => Boolean(value)));
  const parkingMode = mode(
    choices
      .map((row) => parkingLabelFromDistance(row.parking_distance))
      .filter((value): value is "Close" | "Walk" | "Hike" => Boolean(value))
  );
  const bringFieldChairsMode = mostSelectedBringFieldChairs(choices.map((row) => row.bring_field_chairs));
  const reviewParkingFeeValues = choices
    .map((row) => (typeof row.player_parking_fee === "number" ? row.player_parking_fee : null))
    .filter((value): value is number => value != null && Number.isFinite(value));
  const reviewParkingFeeMode = modeNumber(reviewParkingFeeValues);
  const reviewParkingFeeRange = parkingFeeRange(choices);
  const reviewParkingFee = reviewParkingFeeRange ?? (reviewParkingFeeMode == null ? null : formatCurrency(reviewParkingFeeMode));
  const tournamentParkingFee = parseParkingFeeString(input.tournament_player_parking_fee);
  const venueParkingFee = parseParkingFeeString(input.venue_player_parking_fee);
  const bringFieldChairs =
    bringFieldChairsMode !== "—"
      ? bringFieldChairsMode
      : typeof input.venue_bring_field_chairs === "boolean"
        ? input.venue_bring_field_chairs
          ? "Yes"
          : "No"
        : "—";
  const onSiteFoodVendors = modeBoolean(choices.map((row) => row.food_vendors));
  const onSiteCoffeeVendors = modeBoolean(choices.map((row) => row.coffee_vendors));

  return {
    foodVendors: onSiteFoodVendors,
    coffeeVendors: onSiteCoffeeVendors,
    playerParkingFee: tournamentParkingFee ?? venueParkingFee ?? reviewParkingFee ?? "—",
    vendorScore: formatVendorScore(input.vendor_score_avg),
    restrooms: restroomMode ?? "—",
    restroomCleanliness: formatAvg(input.restroom_cleanliness_avg),
    shade: formatAvg(input.shade_score_avg),
    parkingLabel: parkingMode ?? parkingLabelFromAverage(input.parking_convenience_score_avg),
    parkingNotes: latestTwoNoteLines(choices, "parking_notes"),
    bringFieldChairs,
    seatingNotes: latestTwoNoteLines(choices, "seating_notes"),
    reviewCount: Number(input.review_count ?? 0),
    updatedLabel: formatUpdated(input.reviews_last_updated_at),
  };
}
