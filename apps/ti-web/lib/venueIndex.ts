export type VenueIndexLabel = "High" | "Good" | "Fair" | "Low";

export type VenueIndexInput = {
  restroom_cleanliness_avg?: number | null;
  parking_convenience_score_avg?: number | null;
  shade_score_avg?: number | null;
  vendor_score_avg?: number | null;
  review_count?: number | null;
  reviews_last_updated_at?: string | Date | null;
  now?: Date;
};

export type VenueIndexResult = {
  index: number | null;
  base: number;
  confidenceFactor: number;
  freshnessScore: number;
  label: VenueIndexLabel;
  bars: 0 | 1 | 2 | 3 | 4 | 5;
  notes?: string;
};

const DEFAULT_WEIGHTS = {
  restrooms: 0.30,
  parking: 0.25,
  shade: 0.20,
  vendors: 0.15,
  freshness: 0.10,
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeScore(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const v = Number(value);
  // Treat > 5 values as already on a 0-100 scale.
  if (v > 5) return clamp(v, 0, 100);
  // Default assumption: 1-5 scale.
  return clamp(((v - 1) / 4) * 100, 0, 100);
}

function confidenceFactor(reviewCount: number): number {
  if (reviewCount <= 2) return 0.85;
  if (reviewCount <= 4) return 0.9;
  if (reviewCount <= 9) return 0.95;
  return 1;
}

function freshnessScoreFromDate(
  reviewsLastUpdatedAt: string | Date | null | undefined,
  now: Date
): number {
  if (!reviewsLastUpdatedAt) return 40;
  const date =
    reviewsLastUpdatedAt instanceof Date
      ? reviewsLastUpdatedAt
      : new Date(reviewsLastUpdatedAt);
  if (Number.isNaN(date.getTime())) return 40;

  const msInDay = 24 * 60 * 60 * 1000;
  const daysSinceUpdate = Math.floor((now.getTime() - date.getTime()) / msInDay);

  if (daysSinceUpdate <= 30) return 100;
  if (daysSinceUpdate <= 90) return 85;
  if (daysSinceUpdate <= 180) return 70;
  if (daysSinceUpdate <= 365) return 55;
  return 40;
}

export function scoreToBars(index: number | null | undefined): 0 | 1 | 2 | 3 | 4 | 5 {
  if (index == null || !Number.isFinite(index)) return 0;
  return clamp(Math.ceil(index / 20), 0, 5) as 0 | 1 | 2 | 3 | 4 | 5;
}

export function indexLabel(index: number | null | undefined): VenueIndexLabel {
  if (index == null || !Number.isFinite(index)) return "Low";
  if (index >= 85) return "High";
  if (index >= 70) return "Good";
  if (index >= 55) return "Fair";
  return "Low";
}

export function computeVenueIndex(input: VenueIndexInput): VenueIndexResult {
  const reviewCount = Number(input.review_count ?? 0);
  const now = input.now ?? new Date();
  const freshnessScore = freshnessScoreFromDate(input.reviews_last_updated_at, now);

  if (!Number.isFinite(reviewCount) || reviewCount <= 0) {
    return {
      index: null,
      base: 0,
      confidenceFactor: 0.85,
      freshnessScore,
      label: "Low",
      bars: 0,
      notes: "Not enough data",
    };
  }

  const normalized = {
    restrooms: normalizeScore(input.restroom_cleanliness_avg),
    parking: normalizeScore(input.parking_convenience_score_avg),
    shade: normalizeScore(input.shade_score_avg),
    vendors: normalizeScore(input.vendor_score_avg),
  };

  const presentComponents = Object.values(normalized).filter(
    (value): value is number => typeof value === "number"
  );

  // Require at least two component averages to avoid overfitting to sparse values.
  if (presentComponents.length < 2) {
    return {
      index: null,
      base: 0,
      confidenceFactor: confidenceFactor(reviewCount),
      freshnessScore,
      label: "Low",
      bars: 0,
      notes: "Not enough data",
    };
  }

  const weightedParts: Array<{ score: number; weight: number }> = [
    { score: freshnessScore, weight: DEFAULT_WEIGHTS.freshness },
  ];

  if (normalized.restrooms != null) {
    weightedParts.push({ score: normalized.restrooms, weight: DEFAULT_WEIGHTS.restrooms });
  }
  if (normalized.parking != null) {
    weightedParts.push({ score: normalized.parking, weight: DEFAULT_WEIGHTS.parking });
  }
  if (normalized.shade != null) {
    weightedParts.push({ score: normalized.shade, weight: DEFAULT_WEIGHTS.shade });
  }
  if (normalized.vendors != null) {
    weightedParts.push({ score: normalized.vendors, weight: DEFAULT_WEIGHTS.vendors });
  }

  const totalWeight = weightedParts.reduce((sum, part) => sum + part.weight, 0);
  const base =
    totalWeight > 0
      ? weightedParts.reduce((sum, part) => sum + (part.score * part.weight) / totalWeight, 0)
      : 0;

  const factor = confidenceFactor(reviewCount);
  const index = Math.round(clamp(base * factor, 0, 100));

  return {
    index,
    base: Number(base.toFixed(2)),
    confidenceFactor: factor,
    freshnessScore,
    label: indexLabel(index),
    bars: scoreToBars(index),
    notes: reviewCount < 5 ? "Early data — score stabilizes as reviews increase." : undefined,
  };
}
