import assert from "node:assert/strict";
import test from "node:test";

import {
  CORRALIO_OVERTURE_MATCH_RULE_VERSION,
  CORRALIO_OVERTURE_CANDIDATE_QUALITY_RULE_VERSION,
  CORRALIO_OVERTURE_FOOD_TAG_RULE_VERSION,
  assertWithinOperationalBounds,
  classifyOvertureCategory,
  deriveAcceptedOvertureFoodTags,
  evaluateOvertureCandidate,
  evaluateOvertureVenueMatch,
  normalizeCandidateOperatingStatus,
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

test("accepts only property-scoped CDLA Overture operating-status signals", () => {
  const signal = { property: "/properties/operating_status", dataset: "overture-signals", license: "CDLA-Permissive-2.0", recordId: "signal-1", updateTime: null };
  assert.equal(normalizeOvertureProvenance([signal])?.[0].dataset, "overture-signals");
  assert.equal(normalizeOvertureProvenance([{ ...signal, license: null }]), null);
  assert.equal(normalizeOvertureProvenance([{ ...signal, property: "/properties/names" }]), null);
  assert.equal(normalizeOvertureProvenance([{ ...signal, license: "Apache-2.0" }]), null);
  assert.equal(normalizeOvertureProvenance([{ ...signal, dataset: "foursquare" }]), null);
});

test("uses three explicit operating-status states and excludes confirmed closures", () => {
  assert.equal(normalizeCandidateOperatingStatus("open"), "confirmed_open");
  assert.equal(normalizeCandidateOperatingStatus("closed"), "confirmed_closed");
  assert.equal(normalizeCandidateOperatingStatus(null), "status_unknown");
  assert.equal(evaluateOvertureCandidate(place({ operatingStatus: "closed" })).reason, "confirmed_closed");
});

test("rejects generalized contradictory identities without exact-name blacklists", () => {
  const rejected = [
    ["Neighborhood Men's Medical Clinic", "sandwich_shop"],
    ["Jordan Smith, Realtor", "gastropub"],
    ["Helping Elders Senior Helpers", "restaurant"],
    ["Lakeview Township", "sandwich_shop"],
    ["Corner Liquor Lotto Pizza Gas and More", "pizza_restaurant"],
    ["Regional Restaurant Management LLC", "restaurant"],
  ] as const;
  for (const [name, taxonomyPrimary] of rejected) {
    const decision = evaluateOvertureCandidate(place({ name, taxonomyPrimary }));
    assert.equal(decision.accepted, false);
    assert.equal(decision.reason, "contradictory_identity");
  }
  assert.equal(evaluateOvertureCandidate(place({ name: "Harbor Health Foods Cafe", taxonomyPrimary: "cafe", basicCategory: "cafe" })).accepted, true);
  assert.equal(evaluateOvertureCandidate(place({ name: "Elam Brothers", taxonomyPrimary: "fast_food_restaurant" })).accepted, true);
});

test("maps exact intent categories while preserving Food and Coffee pools", () => {
  const cases = [
    ["fast_food_restaurant", "food", "quick_service"],
    ["pizza_restaurant", "food", "pizza"],
    ["sandwich_shop", "food", "sandwiches"],
    ["brewery", "food", "brewery"],
    ["restaurant", "food", "other_food"],
    ["coffee_shop", "coffee", "coffee"],
  ] as const;
  for (const [taxonomyPrimary, poolCategory, expectedIntent] of cases) {
    const decision = evaluateOvertureCandidate(place({
      taxonomyPrimary,
      basicCategory: taxonomyPrimary === "coffee_shop" ? "cafe" : "restaurant",
      taxonomyHierarchy: ["food_and_drink", taxonomyPrimary],
      operatingStatus: taxonomyPrimary === "brewery" ? "open" : null,
    }));
    assert.equal(decision.poolCategory, poolCategory);
    assert.equal(decision.intentCategory, expectedIntent);
    assert.equal(decision.ruleVersion, CORRALIO_OVERTURE_CANDIDATE_QUALITY_RULE_VERSION);
  }
});

test("maps the exact food-tag vocabulary from approved structured taxonomy", () => {
  const cases = [
    ["mexican_restaurant", "mexican"],
    ["chinese_restaurant", "chinese"],
    ["italian_restaurant", "italian"],
    ["japanese_restaurant", "japanese"],
    ["sushi_restaurant", "sushi"],
    ["american_restaurant", "american"],
    ["burger_restaurant", "burgers"],
    ["barbecue_restaurant", "bbq"],
  ] as const;
  for (const [structuredCategory, expectedTag] of cases) {
    const tags = deriveAcceptedOvertureFoodTags(place({
      name: `Local ${expectedTag} fixture`,
      taxonomyPrimary: structuredCategory,
      taxonomyHierarchy: ["food_and_drink", "restaurant", structuredCategory],
      sources: [{
        property: "/properties/taxonomy",
        dataset: "meta",
        recordId: `record-${expectedTag}`,
        updateTime: null,
      }],
    }));
    assert.deepEqual(tags.map((tag) => tag.foodTag), [expectedTag]);
    assert.equal(tags[0].ruleVersion, CORRALIO_OVERTURE_FOOD_TAG_RULE_VERSION);
    assert.equal(tags[0].evidenceField, "taxonomy_primary");
  }
});

test("food tags use alternates, remain sorted/unique, and retain real provenance", () => {
  const tags = deriveAcceptedOvertureFoodTags(place({
    name: "Local Quick Service Fixture",
    taxonomyPrimary: "fast_food_restaurant",
    taxonomyHierarchy: ["food_and_drink", "casual_eatery", "fast_food_restaurant"],
    taxonomyAlternates: ["mexican_restaurant"],
    categoryPrimary: "fast_food_restaurant",
    categoryAlternates: ["mexican_restaurant", "american_restaurant", "burger_restaurant"],
    sources: [
      { property: null, dataset: "meta", recordId: "record-level", updateTime: null },
      { property: "/properties/categories", dataset: "meta", recordId: "categories", updateTime: null },
    ],
  }));
  assert.deepEqual(tags.map((tag) => tag.foodTag), ["american", "burgers", "mexican"]);
  assert.equal(tags.find((tag) => tag.foodTag === "mexican")?.evidenceField, "taxonomy_alternates");
  assert.equal(tags.find((tag) => tag.foodTag === "american")?.provenance.propertyName, "/properties/categories");
});

test("food tags neither invent unsupported values nor rescue or reorder candidates", () => {
  assert.deepEqual(deriveAcceptedOvertureFoodTags(place({
    name: "Mexican Sushi Burger Words Only",
    categoryPrimary: "unsupported_food_style",
    sources: [{ property: null, dataset: "meta", recordId: "record-level", updateTime: null }],
  })), []);
  assert.deepEqual(deriveAcceptedOvertureFoodTags(place({
    name: "Neighborhood Medical Clinic",
    categoryPrimary: "mexican_restaurant",
    sources: [{ property: null, dataset: "meta", recordId: "record-level", updateTime: null }],
  })), []);
  assert.deepEqual(deriveAcceptedOvertureFoodTags(place({
    categoryPrimary: "mexican_restaurant",
    sources: [{ property: "/properties/names", dataset: "meta", recordId: "names-only", updateTime: null }],
  })), []);

  const candidates = [
    place({ featureId: "tag-order-a", name: "Local A", latitude: 47.4692 }),
    place({ featureId: "tag-order-b", name: "Local B", latitude: 47.4693 }),
  ];
  const tagged = candidates.map((candidate, index) => ({
    ...candidate,
    categoryAlternates: index === 0 ? ["mexican_restaurant"] : ["chinese_restaurant"],
  }));
  const logicalPool = (values: OverturePlace[]) => selectOvertureCandidates(venue, values)
    .map((row) => row.place.featureId);
  assert.deepEqual(logicalPool(tagged), logicalPool(candidates));
});

test("rejects weak addressless identity and uncertain low-confidence brewery generically", () => {
  assert.equal(evaluateOvertureCandidate(place({ address: null, existenceConfidence: 0.79 })).reason, "insufficient_identity");
  assert.equal(evaluateOvertureCandidate(place({
    name: "Old Mill Brewing",
    taxonomyPrimary: "brewery",
    taxonomyHierarchy: ["food_and_drink", "brewery"],
    existenceConfidence: 0.79,
    operatingStatus: null,
  })).reason, "brewery_existence_uncertain");
  assert.equal(evaluateOvertureCandidate(place({
    name: "Current Local Brewery",
    taxonomyPrimary: "brewery",
    taxonomyHierarchy: ["food_and_drink", "brewery"],
    existenceConfidence: 0.95,
    operatingStatus: null,
  })).accepted, true);
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

test("deduplicates alias-equivalent same-address places but preserves separate brand locations", () => {
  const rows = selectOvertureCandidates(venue, [
    place({ featureId: "coffee-a", name: "Northstar Coffee", basicCategory: "cafe", taxonomyPrimary: "coffee_shop", address: "10 Main St", existenceConfidence: 0.91 }),
    place({ featureId: "coffee-b", name: "Northstar Coffee Company", basicCategory: "cafe", taxonomyPrimary: "coffee_shop", address: "10 Main Street", existenceConfidence: 0.95 }),
    place({ featureId: "coffee-c", name: "Northstar Coffee", basicCategory: "cafe", taxonomyPrimary: "coffee_shop", address: "20 Main St", existenceConfidence: 0.99 }),
  ]);
  assert.deepEqual(rows.map((row) => row.place.featureId).sort(), ["coffee-b", "coffee-c"]);
});

test("quick-option priority is deterministic and total broad-category cap is unchanged", () => {
  const others = Array.from({ length: 15 }, (_, index) => place({
    featureId: `other-${index}`,
    name: `Local Restaurant ${index}`,
    latitude: 47.46901 + index / 1_000_000,
  }));
  const quick = place({
    featureId: "quick",
    name: "Local Chicken",
    taxonomyPrimary: "fast_food_restaurant",
    latitude: 47.47,
  });
  const selected = selectOvertureCandidates(venue, [...others, quick]);
  assert.equal(selected.filter((row) => row.category === "food").length, 15);
  assert(selected.some((row) => row.place.featureId === "quick"));
});

test("identical logical input replays to the same ordered candidate pool", () => {
  const input = [
    place({ featureId: "replay-other", name: "Replay Local Kitchen", taxonomyPrimary: "restaurant" }),
    place({ featureId: "replay-pizza", name: "Replay Pizza", taxonomyPrimary: "pizza_restaurant", latitude: 47.4701 }),
    place({ featureId: "replay-coffee", name: "Replay Coffee", basicCategory: "cafe", taxonomyPrimary: "coffee_shop", latitude: 47.4702 }),
  ];
  const logicalPool = (places: OverturePlace[]) => selectOvertureCandidates(venue, places).map((row) => ({
    category: row.category,
    intentCategory: row.intentCategory,
    featureId: row.place.featureId,
  }));
  assert.deepEqual(logicalPool(input), logicalPool([...input].reverse()));
  assert.deepEqual(logicalPool(input), logicalPool(input));
});

test("operational limits fail closed", () => {
  assert.doesNotThrow(() => assertWithinOperationalBounds({
    venues: 1, boxes: 1, downloadedBytes: 1, candidatesExamined: 1, elapsedSeconds: 1, concurrency: 1,
  }));
  assert.throws(() => assertWithinOperationalBounds({
    venues: 11, boxes: 1, downloadedBytes: 1, candidatesExamined: 1, elapsedSeconds: 1, concurrency: 1,
  }), /max_venues/);
});
