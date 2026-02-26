import test from "node:test";
import assert from "node:assert/strict";
import { computeVenueIndex } from "./venueIndex";

test("computeVenueIndex: normal case with all fields and strong review count", () => {
  const result = computeVenueIndex({
    restroom_cleanliness_avg: 4,
    parking_convenience_score_avg: 4,
    shade_score_avg: 4,
    vendor_score_avg: 4,
    review_count: 20,
    reviews_last_updated_at: "2026-02-20T00:00:00.000Z",
    now: new Date("2026-02-26T00:00:00.000Z"),
  });

  assert.equal(result.index, 78);
  assert.equal(result.label, "Good");
  assert.equal(result.confidenceFactor, 1);
  assert.equal(result.freshnessScore, 100);
});

test("computeVenueIndex: low review volume reduces confidence", () => {
  const result = computeVenueIndex({
    restroom_cleanliness_avg: 4,
    parking_convenience_score_avg: 4,
    shade_score_avg: 4,
    vendor_score_avg: 4,
    review_count: 2,
    reviews_last_updated_at: "2026-02-20T00:00:00.000Z",
    now: new Date("2026-02-26T00:00:00.000Z"),
  });

  assert.equal(result.index, 66);
  assert.equal(result.confidenceFactor, 0.85);
});

test("computeVenueIndex: stale updates lower freshness contribution", () => {
  const result = computeVenueIndex({
    restroom_cleanliness_avg: 4,
    parking_convenience_score_avg: 4,
    shade_score_avg: 4,
    vendor_score_avg: 4,
    review_count: 20,
    reviews_last_updated_at: "2024-01-01T00:00:00.000Z",
    now: new Date("2026-02-26T00:00:00.000Z"),
  });

  assert.equal(result.freshnessScore, 40);
  assert.equal(result.index, 72);
});

test("computeVenueIndex: missing a component renormalizes remaining weights", () => {
  const result = computeVenueIndex({
    restroom_cleanliness_avg: 4,
    parking_convenience_score_avg: 4,
    shade_score_avg: 4,
    vendor_score_avg: null,
    review_count: 20,
    reviews_last_updated_at: "2026-02-20T00:00:00.000Z",
    now: new Date("2026-02-26T00:00:00.000Z"),
  });

  assert.equal(result.index, 78);
  assert.equal(result.base, 77.94);
});

test("computeVenueIndex: review_count zero returns not enough data", () => {
  const result = computeVenueIndex({
    restroom_cleanliness_avg: 4,
    parking_convenience_score_avg: 4,
    shade_score_avg: 4,
    vendor_score_avg: 4,
    review_count: 0,
    reviews_last_updated_at: "2026-02-20T00:00:00.000Z",
    now: new Date("2026-02-26T00:00:00.000Z"),
  });

  assert.equal(result.index, null);
  assert.equal(result.bars, 0);
  assert.equal(result.notes, "Not enough data");
});
