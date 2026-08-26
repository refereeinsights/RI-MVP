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
  selectOvertureCandidatesWithAudit,
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

test("Dwight Merkel regression resolves physical identities without deduplicating brand alone", () => {
  const dwightMerkel = { latitude: 47.7102701, longitude: -117.4782941 };
  const coffee = (overrides: Partial<OverturePlace>): OverturePlace => place({
    basicCategory: "cafe",
    taxonomyPrimary: "coffee_shop",
    taxonomyHierarchy: ["food_and_drink", "cafe", "coffee_shop"],
    locality: "Spokane",
    ...overrides,
  });
  const meta = (recordId: string) => [{
    property: "",
    dataset: "meta",
    license: "CDLA-Permissive-2.0",
    recordId,
    updateTime: "2026-08-10T00:00:00.000Z",
  }];
  const overtureSignal = {
    property: "/properties/operating_status",
    dataset: "Overture-signals",
    license: "CDLA-Permissive-2.0",
    recordId: "open-signal",
    updateTime: "2026-08-10T22:54:24Z",
  };
  const fixtures = [
    place({
      featureId: "eaffb9bc-f543-4eee-9479-9830c6d5ac3b",
      name: "Fast Freddies!",
      address: "6811 N Belt St",
      locality: "Spokane",
      latitude: 47.71985684,
      longitude: -117.44347873,
      taxonomyPrimary: "fast_food_restaurant",
      existenceConfidence: 0.7932705879211426,
      operatingStatus: null,
      sources: meta("159758480776526"),
    }),
    coffee({
      featureId: "e638d357-66c9-4f3a-8ef4-a94fc0434f5f",
      name: "Spokane, WA (Mofro)",
      address: "1010 W. Francis Ave.",
      latitude: 47.715483,
      longitude: -117.425811,
      existenceConfidence: 0.8,
      operatingStatus: null,
      sources: [{ property: "", dataset: "AllThePlaces", license: "CC0-1.0", recordId: "mofro", updateTime: "2026-08-05T15:33:36.000Z" }],
    }),
    coffee({
      featureId: "aaf014ed-ebdb-4f36-b254-ad2abc8e6d28",
      name: "Dutch Bros. Coffee",
      address: "1010 W. Francis Ave.",
      latitude: 47.71545527,
      longitude: -117.42554026,
      existenceConfidence: 0.9199122190475464,
      operatingStatus: "open",
      sources: [...meta("562257764147040"), overtureSignal],
    }),
    coffee({
      featureId: "c8a093e3-11ab-4b44-96d6-b09b498e6ed0",
      name: "Jitterz Java",
      address: "2135 W Northwest Blvd",
      latitude: 47.682711,
      longitude: -117.444403,
      existenceConfidence: 0.9199122190475464,
      operatingStatus: "open",
      sources: [{ property: "", dataset: "BrightQuery", license: "CDLA-Permissive-2.0", recordId: "101759886", updateTime: "2026-08-13T13:23:42.875Z" }, overtureSignal],
    }),
    coffee({
      featureId: "4a3f576a-ec5b-46bf-ac9a-6641cabcd0f3",
      name: "White Dog Coffee",
      address: "2135 W Northwest Blvd",
      latitude: 47.682804969392436,
      longitude: -117.44425538925962,
      existenceConfidence: 0.9199122190475464,
      operatingStatus: "open",
      sources: [...meta("1985893671500888"), overtureSignal],
    }),
    coffee({
      featureId: "f3258e32-599a-45b4-b95b-55c55b72a6df",
      name: "Starbucks",
      address: "2507 Wellesley Ave",
      latitude: 47.7006,
      longitude: -117.4476,
      existenceConfidence: 0.97,
      operatingStatus: "open",
      sources: [{ property: "", dataset: "Microsoft", license: "CDLA-Permissive-2.0", recordId: "wellesley-old", updateTime: "2025-09-11T20:10:10.630Z" }, overtureSignal],
    }),
    coffee({
      featureId: "a2f98b40-6e3f-4e9e-9816-800815fb5d5f",
      name: "Starbucks",
      address: "2507 W Wellesley Ave",
      latitude: 47.69945725,
      longitude: -117.44723671,
      existenceConfidence: 0.9902192950248718,
      operatingStatus: "open",
      sources: [...meta("149551575069535"), overtureSignal],
    }),
    coffee({
      featureId: "0a3c9ded-939f-43a5-8d7e-628bd6cbd09b",
      name: "Starbucks",
      address: "9001 N Indian Trails Rd",
      latitude: 47.73967,
      longitude: -117.48822,
      existenceConfidence: 0.8,
      operatingStatus: "open",
      sources: [{ property: "", dataset: "AllThePlaces", license: "CC0-1.0", recordId: "indian-9001", updateTime: "2026-08-05T15:33:36.000Z" }, overtureSignal],
    }),
    coffee({
      featureId: "8738a665-70bb-4243-9059-bb8347c47340",
      name: "Starbucks",
      address: "9031 N Indian Trail Rd Sundance Plaza",
      latitude: 47.74052983,
      longitude: -117.48870125,
      existenceConfidence: 0.9199122190475464,
      operatingStatus: "open",
      sources: [...meta("149320061759546"), overtureSignal],
    }),
  ];

  assert.equal(evaluateOvertureCandidate(fixtures[0]).reason, "unconfirmed_low_confidence_identity");
  const audit = selectOvertureCandidatesWithAudit(dwightMerkel, fixtures);
  assert.deepEqual(audit.selected.map((row) => row.place.featureId).sort(), [
    "0a3c9ded-939f-43a5-8d7e-628bd6cbd09b",
    "4a3f576a-ec5b-46bf-ac9a-6641cabcd0f3",
    "8738a665-70bb-4243-9059-bb8347c47340",
    "a2f98b40-6e3f-4e9e-9816-800815fb5d5f",
    "aaf014ed-ebdb-4f36-b254-ad2abc8e6d28",
  ].sort());
  assert.equal(audit.collisions.filter((collision) => collision.outcome === "same_identity_resolved").length, 1);
  assert.equal(audit.collisions.filter((collision) => collision.outcome === "historical_identity_resolved").length, 2);
  assert.equal(audit.excludedByCollision, 3);
  assert.equal(audit.unresolvedIdentityCount, 0);
});

test("excludes unresolved same-place material identity collisions", () => {
  const audit = selectOvertureCandidatesWithAudit(venue, [
    place({ featureId: "uncertain-a", name: "Current Cafe A", basicCategory: "cafe", taxonomyPrimary: "coffee_shop", address: "40 Main St", operatingStatus: "open" }),
    place({ featureId: "uncertain-b", name: "Current Cafe B", basicCategory: "cafe", taxonomyPrimary: "coffee_shop", address: "40 Main Street", operatingStatus: "open" }),
  ]);
  assert.equal(audit.selected.length, 0);
  assert.equal(audit.unresolvedIdentityCount, 1);
  assert.equal(audit.collisions[0].outcome, "unresolved_excluded");
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
