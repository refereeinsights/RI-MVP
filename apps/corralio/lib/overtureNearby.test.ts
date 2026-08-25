import assert from "node:assert/strict";
import test from "node:test";

import {
  CORRALIO_OVERTURE_MATCH_RULE_VERSION,
  assertWithinOperationalBounds,
  classifyOvertureCategory,
  evaluateOvertureVenueMatch,
  normalizeOvertureProvenance,
  selectOvertureCandidates,
  type OverturePlace,
} from "./overtureNearby";

const venue = {
  name: "Starfire Sports",
  normalizedAddress: "14800 starfire way",
  locality: "Tukwila",
  latitude: 47.469,
  longitude: -122.246,
};
const place = (overrides: Partial<OverturePlace> = {}): OverturePlace => ({
  featureId: "feature-1",
  featureVersion: 7,
  release: "2026-08-19.0",
  name: "Starfire Sports",
  basicCategory: "restaurant",
  taxonomyPrimary: "casual_eatery",
  taxonomyHierarchy: ["food_and_drink", "restaurant", "casual_eatery"],
  existenceConfidence: 0.9,
  latitude: 47.4691,
  longitude: -122.2461,
  address: "14800 Starfire Way",
  locality: "Tukwila",
  sources: [{ property: "names", dataset: "meta", recordId: "abc", updateTime: null }],
  ...overrides,
});

test("classifies Food and Coffee from current taxonomy fields", () => {
  assert.equal(classifyOvertureCategory(place()), "food");
  assert.equal(classifyOvertureCategory(place({ basicCategory: "cafe", taxonomyHierarchy: ["food_and_drink", "cafe"] })), "coffee");
});

test("rejects Foursquare and unknown or incomplete provenance", () => {
  assert.equal(normalizeOvertureProvenance(place().sources)?.[0].licenseId, "CDLA-Permissive-2.0");
  assert.equal(normalizeOvertureProvenance([{ property: null, dataset: "foursquare", recordId: null, updateTime: null }]), null);
  assert.equal(normalizeOvertureProvenance([{ property: null, dataset: "unknown", recordId: null, updateTime: null }]), null);
});

test("venue match is deterministic, versioned, and ambiguity-safe", () => {
  const result = evaluateOvertureVenueMatch(venue, [place()]);
  assert.equal(result.ruleVersion, CORRALIO_OVERTURE_MATCH_RULE_VERSION);
  assert.equal(result.outcome, "matched");
  assert.equal(evaluateOvertureVenueMatch(venue, [place(), place({ featureId: "feature-2" })]).outcome, "ambiguous");
  assert.equal(evaluateOvertureVenueMatch(venue, [place({ address: "112 Main St" })]).outcome, "no_match");
});

test("existence confidence filters candidates but never determines venue matching", () => {
  assert.equal(evaluateOvertureVenueMatch(venue, [place({ existenceConfidence: 0.1 })]).outcome, "matched");
  assert.equal(selectOvertureCandidates(venue, [place({ existenceConfidence: 0.69 })]).length, 0);
});

test("candidate pool enforces radius, deterministic dedupe, and cap", () => {
  const rows = selectOvertureCandidates(venue, [
    place(),
    place({ latitude: 47.4692 }),
    place({ featureId: "far", latitude: 48 }),
    place({ featureId: "coffee", basicCategory: "cafe", taxonomyHierarchy: ["food_and_drink", "cafe"] }),
  ], { cap: 1 });
  assert.deepEqual(rows.map((row) => row.category), ["food", "coffee"]);
  assert.equal(rows[0].place.featureId, "feature-1");
});

test("operational limits fail closed", () => {
  assert.doesNotThrow(() => assertWithinOperationalBounds({
    venues: 1, boxes: 1, downloadedBytes: 1, candidatesExamined: 1, elapsedSeconds: 1, concurrency: 1,
  }));
  assert.throws(() => assertWithinOperationalBounds({
    venues: 11, boxes: 1, downloadedBytes: 1, candidatesExamined: 1, elapsedSeconds: 1, concurrency: 1,
  }), /max_venues/);
});
