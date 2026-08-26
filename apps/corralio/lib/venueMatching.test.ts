import assert from "node:assert/strict";
import test from "node:test";

import {
  CORRALIO_UNMATCHED_RECHECK_DAYS,
  CORRALIO_VENUE_MATCHER_VERSION,
  evaluateVenueMatches,
  isHouseholdOriginLocation,
  normalizePrivacyAddress,
  normalizeVenueComparable,
  venueLocationFingerprint,
  type ExistingVenueMatch,
  type VenueCandidate,
  type VenueMatchEvent,
} from "./venueMatching";

const NOW = new Date("2026-08-25T19:00:00.000Z");
const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000044";

const venues: VenueCandidate[] = [
  { id: "venue-1", name: "Avery Sports Complex", address: "123 Main Street", city: "Spokane", state: "WA" },
  { id: "venue-2", name: "The Warehouse Athletic Facility", address: "800 North Hamilton Street", city: "Spokane", state: "Washington" },
];

function event(id: string, location: string | null): VenueMatchEvent {
  return { id, sourceLocationText: location, displayLocationText: null };
}

function dependencies(input: {
  candidates?: VenueCandidate[];
  currentVenueIds?: string[];
  uniqueName?: VenueCandidate | null;
  aliasVenueId?: string | null;
} = {}) {
  let queries = 0;
  let currentQueries = 0;
  return {
    value: {
      async listCandidates() {
        queries += 1;
        return { candidates: input.candidates ?? venues, queryCount: 1 };
      },
      async currentVenueIds() {
        currentQueries += 1;
        return new Set(input.currentVenueIds ?? []);
      },
      async currentProvisionalVenueIds() {
        return new Set<string>();
      },
      async findUniqueCanonicalName() {
        return input.uniqueName ?? null;
      },
      async findAlias() {
        return input.aliasVenueId ?? null;
      },
    },
    queries: () => queries,
    currentQueries: () => currentQueries,
  };
}

function existing(input: Partial<ExistingVenueMatch> = {}): ExistingVenueMatch {
  return {
    eventId: "event-1",
    venueId: null,
    provisionalVenueId: null,
    matchStatus: "unmatched",
    locationFingerprint: venueLocationFingerprint(HOUSEHOLD_ID, normalizeVenueComparable("123 Main St, Spokane, WA")),
    matcherVersion: CORRALIO_VENUE_MATCHER_VERSION,
    recheckAfter: "2026-09-24T19:00:00.000Z",
    ...input,
  };
}

test("privacy normalization handles punctuation, street aliases, country, and unit suffixes", () => {
  assert.deepEqual(
    normalizePrivacyAddress("123 N. Main St., Apt #4, Spokane, WA 99201, USA"),
    normalizePrivacyAddress("123 North Main Street Apartment 4 Spokane WA 99201 United States"),
  );
  assert.equal(isHouseholdOriginLocation("123 N Main St, Spokane, WA - Unit 4", "123 North Main Street, Spokane WA"), true);
  assert.equal(isHouseholdOriginLocation("12 Main St, Spokane, WA", "112 Main Street, Spokane, WA"), false);
});

test("private and insufficient locations never query canonical venues", async () => {
  const deps = dependencies();
  const result = await evaluateVenueMatches({
    householdId: HOUSEHOLD_ID,
    originAddress: "123 North Main Street, Spokane, WA",
    events: [event("private", "123 N Main St, Spokane, WA - Unit 4"), event("sparse", "Field 1"), event("empty", null)],
    existing: [],
    now: NOW,
  }, deps.value);
  assert.deepEqual(result.results.map((row) => row.matchStatus), ["private_skipped", "insufficient_location", "insufficient_location"]);
  assert.equal(deps.queries(), 0);
  assert.equal(deps.currentQueries(), 0);
});

test("an origin change reclassifies a former match before any canonical query", async () => {
  const location = "123 Main St, Spokane, WA";
  const deps = dependencies({ currentVenueIds: ["venue-1"] });
  const result = await evaluateVenueMatches({
    householdId: HOUSEHOLD_ID,
    originAddress: "123 Main Street, Spokane, WA",
    events: [event("event-1", location)],
    existing: [existing({ venueId: "venue-1", matchStatus: "matched", recheckAfter: null })],
    now: NOW,
  }, deps.value);
  assert.equal(result.results[0]?.matchStatus, "private_skipped");
  assert.equal(deps.currentQueries(), 0);
  assert.equal(deps.queries(), 0);
});

test("one complete city/state candidate group supports conservative address and name matches", async () => {
  const deps = dependencies();
  const result = await evaluateVenueMatches({
    householdId: HOUSEHOLD_ID,
    originAddress: null,
    events: [
      event("address", "800 N Hamilton St, Spokane, Washington 99202, USA - Court 3"),
      event("name", "Avery Sports Complex, Spokane, WA"),
      event("country", "Avery Sports Complex Spokane, WA, United States"),
    ],
    existing: [],
    now: NOW,
  }, deps.value);
  assert.deepEqual(result.results.map((row) => [row.eventId, row.matchStatus, row.venueId]), [
    ["address", "matched", "venue-2"],
    ["name", "matched", "venue-1"],
    ["country", "matched", "venue-1"],
  ]);
  assert.equal(deps.queries(), 1);
  assert.equal(result.stats.reusedCandidateGroups, 2);
});

test("production-representative incomplete locations resolve without loose identity guesses", async () => {
  const plantes = {
    id: "plantes",
    name: "Plantes Ferry Sports Complex",
    address: "12320 E Upriver Dr Spokane WA 99216",
    city: "Spokane Valley",
    state: "WA",
  };
  const eagles = {
    id: "eagles",
    name: "Eagles Ice Arena",
    address: "6321 N Addison St, Spokane, WA",
    city: "Spokane",
    state: "WA",
  };
  const deps = dependencies({ candidates: [plantes], uniqueName: eagles });
  const result = await evaluateVenueMatches({
    householdId: HOUSEHOLD_ID,
    originAddress: null,
    events: [
      event("plantes", "12320 E Upriver Drive, Spokane Valley, WA 99206"),
      event("eagles", "Eagles Ice Arena (home ice)"),
    ],
    existing: [],
    now: NOW,
  }, deps.value);
  assert.deepEqual(result.results.map((row) => [row.eventId, row.matchStatus, row.venueId]), [
    ["plantes", "matched", "plantes"],
    ["eagles", "matched", "eagles"],
  ]);
});

test("different street numbers and ambiguous name-only locations never match", async () => {
  const deps = dependencies({
    candidates: [{ id: "plantes", name: "Plantes Ferry", address: "12308 E Upriver Dr", city: "Spokane Valley", state: "WA" }],
    uniqueName: null,
  });
  const result = await evaluateVenueMatches({
    householdId: HOUSEHOLD_ID,
    originAddress: null,
    events: [
      event("address", "12320 E Upriver Drive, Spokane Valley, WA 99206"),
      event("name", "Common Sports Park (home field)"),
    ],
    existing: [],
    now: NOW,
  }, deps.value);
  assert.deepEqual(result.results.map((row) => row.matchStatus), ["unmatched", "unmatched"]);
});

test("validated aliases are fallback-only and remain exact", async () => {
  const deps = dependencies({ candidates: [], aliasVenueId: "venue-alias" });
  const result = await evaluateVenueMatches({
    householdId: HOUSEHOLD_ID,
    originAddress: null,
    events: [event("alias", "12320 E Upriver Drive, Spokane Valley, WA 99206")],
    existing: [],
    now: NOW,
  }, deps.value);
  assert.equal(result.results[0]?.venueId, "venue-alias");
});

test("ambiguous exact candidates remain unmatched with a bounded recheck", async () => {
  const deps = dependencies({
    candidates: [
      { id: "venue-1", name: "Avery Sports Complex", address: "123 Main Street", city: "Spokane", state: "WA" },
      { id: "venue-2", name: "Avery Sports Complex", address: "999 Other Road", city: "Spokane", state: "WA" },
    ],
  });
  const result = await evaluateVenueMatches({ householdId: HOUSEHOLD_ID, originAddress: null, events: [event("event-1", "Avery Sports Complex, Spokane, WA")], existing: [], now: NOW }, deps.value);
  assert.equal(result.results[0]?.matchStatus, "unmatched");
  assert.equal(result.results[0]?.venueId, null);
  assert.equal(
    result.results[0]?.recheckAfter,
    new Date(NOW.getTime() + CORRALIO_UNMATCHED_RECHECK_DAYS * 86_400_000).toISOString(),
  );
});

test("current unmatched results reuse, while age, version, location, and force rematch invalidate", async () => {
  for (const scenario of [
    { name: "expired", prior: existing({ recheckAfter: "2026-08-25T18:59:59.000Z" }), forceRematch: false, location: "123 Main St, Spokane, WA" },
    { name: "version", prior: existing({ matcherVersion: "older" }), forceRematch: false, location: "123 Main St, Spokane, WA" },
    { name: "location", prior: existing(), forceRematch: false, location: "800 N Hamilton St, Spokane, WA" },
    { name: "forced", prior: existing(), forceRematch: true, location: "123 Main St, Spokane, WA" },
  ]) {
    const deps = dependencies();
    const result = await evaluateVenueMatches({ householdId: HOUSEHOLD_ID, originAddress: null, events: [event("event-1", scenario.location)], existing: [scenario.prior], now: NOW, forceRematch: scenario.forceRematch }, deps.value);
    assert.equal(result.results.length, 1, scenario.name);
    assert.equal(deps.queries(), 1, scenario.name);
  }

  const deps = dependencies();
  const reused = await evaluateVenueMatches({ householdId: HOUSEHOLD_ID, originAddress: null, events: [event("event-1", "123 Main St, Spokane, WA")], existing: [existing()], now: NOW }, deps.value);
  assert.equal(reused.results.length, 0);
  assert.equal(deps.queries(), 0);
});

test("a missing canonical venue invalidates a matched record without breaking evaluation", async () => {
  const deps = dependencies({ currentVenueIds: [] });
  const prior = existing({ venueId: "missing-venue", matchStatus: "matched", recheckAfter: null });
  const result = await evaluateVenueMatches({ householdId: HOUSEHOLD_ID, originAddress: null, events: [event("event-1", "123 Main St, Spokane, WA")], existing: [prior], now: NOW }, deps.value);
  assert.equal(result.results[0]?.matchStatus, "matched");
  assert.equal(result.results[0]?.venueId, "venue-1");
});

test("candidate retrieval failure is retryable and produces no authoritative result", async () => {
  await assert.rejects(
    evaluateVenueMatches({ householdId: HOUSEHOLD_ID, originAddress: null, events: [event("event-1", "123 Main St, Spokane, WA")], existing: [], now: NOW }, {
      async listCandidates() { throw new Error("synthetic incomplete scope"); },
      async currentVenueIds() { return new Set(); },
      async currentProvisionalVenueIds() { return new Set(); },
    }),
    /synthetic incomplete scope/,
  );
});

test("a current provisional association is reused until canonical recheck, then canonical wins", async () => {
  const prior = existing({
    provisionalVenueId: "provisional-1",
    matchStatus: "provisional",
    locationFingerprint: venueLocationFingerprint(HOUSEHOLD_ID, normalizeVenueComparable("Avery Sports Complex, Spokane, WA")),
    recheckAfter: "2026-09-24T19:00:00.000Z",
  });
  const value = dependencies({ currentVenueIds: ["venue-1"] }).value;
  value.currentProvisionalVenueIds = async () => new Set(["provisional-1"]);
  const reused = await evaluateVenueMatches({
    householdId: HOUSEHOLD_ID,
    originAddress: null,
    events: [event("event-1", "Avery Sports Complex, Spokane, WA")],
    existing: [prior],
    now: NOW,
  }, value);
  assert.equal(reused.results.length, 0);

  const reconciled = await evaluateVenueMatches({
    householdId: HOUSEHOLD_ID,
    originAddress: null,
    events: [event("event-1", "Avery Sports Complex, Spokane, WA")],
    existing: [prior],
    now: NOW,
    forceRematch: true,
  }, value);
  assert.equal(reconciled.results[0]?.matchStatus, "matched");
  assert.equal(reconciled.results[0]?.venueId, "venue-1");
  assert.equal(reconciled.results[0]?.provisionalVenueId, null);
});
