import assert from "node:assert/strict";
import test from "node:test";

import type { OvertureIntentCategory } from "./overtureNearby";
import {
  prefilterWhatFitsCandidates,
  qualifyAndRankWhatFitsCandidates,
  resolveWhatFitsRequiredArrival,
  sanitizeWhatFitsAnalytics,
  selectWhatFitsGap,
  WHAT_FITS_MAX_RESULTS,
  type WhatFitsCandidateInput,
  type WhatFitsCandidateRoutes,
  type WhatFitsEvent,
} from "./whatFits";

function event(overrides: Partial<WhatFitsEvent> = {}): WhatFitsEvent {
  return {
    id: "event-a",
    startsAt: "2026-08-29T17:00:00.000Z",
    endsAt: "2026-08-29T18:00:00.000Z",
    timezone: "UTC",
    teamId: "team-a",
    scheduleArrivalAt: null,
    sourceArrivalMinutes: null,
    teamArrivalMinutes: null,
    latitude: 47.6,
    longitude: -117.4,
    ...overrides,
  };
}

function candidate(id: string, intentCategory: OvertureIntentCategory = "quick_service", overrides: Partial<WhatFitsCandidateInput> = {}): WhatFitsCandidateInput {
  return {
    id,
    mode: intentCategory === "coffee" ? "coffee" : "food",
    intentCategory,
    operatingStatus: "confirmed_open",
    active: true,
    qualityRuleVersion: "corralio-overture-candidate-quality-v2",
    dedupeRuleVersion: "corralio-overture-dedupe-v2",
    distanceMeters: 500,
    existenceConfidence: 0.9,
    name: `Candidate ${id}`,
    latitude: 47.61,
    longitude: -117.41,
    foodTags: [],
    ...overrides,
  };
}

const route = (outboundMinutes: number, inboundMinutes: number): WhatFitsCandidateRoutes => ({
  outboundMinutes,
  outboundDistanceMeters: outboundMinutes * 1_000,
  inboundMinutes,
  inboundDistanceMeters: inboundMinutes * 1_000,
});

test("required arrival follows explicit schedule, source, team, then the 30-minute default", () => {
  assert.deepEqual(resolveWhatFitsRequiredArrival(event({
    scheduleArrivalAt: "2026-08-29T16:15:00.000Z",
    sourceArrivalMinutes: 90,
    teamArrivalMinutes: 60,
  })), {
    requiredArrivalAt: "2026-08-29T16:15:00.000Z",
    source: "ics_explicit",
    minutes: 45,
  });
  assert.deepEqual(resolveWhatFitsRequiredArrival(event({
    sourceArrivalMinutes: 75,
    teamArrivalMinutes: 60,
  })), {
    requiredArrivalAt: "2026-08-29T15:45:00.000Z",
    source: "source_preference",
    minutes: 75,
  });
  assert.equal(resolveWhatFitsRequiredArrival(event({ teamArrivalMinutes: 60 }))?.requiredArrivalAt, "2026-08-29T16:00:00.000Z");
  assert.deepEqual(resolveWhatFitsRequiredArrival(event()), {
    requiredArrivalAt: "2026-08-29T16:30:00.000Z",
    source: "corralio_default",
    minutes: 30,
  });
});

test("invalid or ambiguous schedule arrival falls through without overriding team/default", () => {
  assert.equal(resolveWhatFitsRequiredArrival(event({
    scheduleArrivalAt: "2026-08-29T12:00:00.000Z",
    sourceArrivalMinutes: null,
    teamArrivalMinutes: 45,
  }))?.source, "team_preference");
});

test("45 minutes is eligible while anything below it is suppressed", () => {
  const current = event({ id: "current", startsAt: "2026-08-29T15:00:00.000Z", endsAt: "2026-08-29T16:00:00.000Z" });
  const exactly = event({ id: "next", startsAt: "2026-08-29T17:15:00.000Z", endsAt: "2026-08-29T18:15:00.000Z" });
  const result = selectWhatFitsGap([current, exactly]);
  assert.equal(result.kind, "eligible");
  if (result.kind === "eligible") assert.equal(result.gap.rawGapMinutes, 45);
  assert.deepEqual(selectWhatFitsGap([current, { ...exactly, startsAt: "2026-08-29T17:14:00.000Z" }]), {
    kind: "suppressed",
    reason: "below_minimum_gap",
  });
});

test("household overlap, missing end, and missing coordinates suppress conservatively", () => {
  const current = event({ id: "current", startsAt: "2026-08-29T14:00:00.000Z", endsAt: "2026-08-29T15:00:00.000Z" });
  const next = event({ id: "next", startsAt: "2026-08-29T18:00:00.000Z", endsAt: "2026-08-29T19:00:00.000Z" });
  const sibling = event({ id: "sibling", startsAt: "2026-08-29T16:00:00.000Z", endsAt: "2026-08-29T17:00:00.000Z" });
  assert.deepEqual(selectWhatFitsGap([current, sibling, next]), { kind: "suppressed", reason: "household_conflict" });
  assert.deepEqual(selectWhatFitsGap([{ ...current, endsAt: null }, next]), { kind: "suppressed", reason: "missing_end" });
  assert.deepEqual(selectWhatFitsGap([current, { ...next, latitude: null }]), { kind: "suppressed", reason: "missing_venue" });
  assert.deepEqual(selectWhatFitsGap([current, next], true), { kind: "suppressed", reason: "household_conflict" });
});

test("household safety distinguishes a true family gap from sibling and ambiguous logistics", () => {
  const current = event({ id: "current", startsAt: "2026-08-29T12:00:00.000Z", endsAt: "2026-08-29T13:00:00.000Z" });
  const next = event({ id: "next", startsAt: "2026-08-29T16:00:00.000Z", endsAt: "2026-08-29T17:00:00.000Z" });
  assert.equal(selectWhatFitsGap([current, next]).kind, "eligible");
  const sibling = event({ id: "sibling", startsAt: "2026-08-29T13:15:00.000Z", endsAt: "2026-08-29T15:45:00.000Z" });
  assert.deepEqual(selectWhatFitsGap([current, sibling, next]), { kind: "suppressed", reason: "household_conflict" });
  assert.deepEqual(selectWhatFitsGap([current, next], true), { kind: "suppressed", reason: "household_conflict" });
});

test("Food and Coffee use strict quality/status gates while status unknown remains eligible", () => {
  const rows = [
    candidate("food"),
    candidate("coffee", "coffee"),
    candidate("closed", "pizza", { operatingStatus: "confirmed_closed" }),
    candidate("unknown", "sandwiches", { operatingStatus: "status_unknown" }),
    candidate("old-quality", "pizza", { qualityRuleVersion: "v1" }),
  ];
  assert.deepEqual(prefilterWhatFitsCandidates(rows, "food", 10).map((row) => row.id), ["food", "unknown"]);
  assert.deepEqual(prefilterWhatFitsCandidates(rows, "coffee", 10).map((row) => row.id), ["coffee"]);
});

test("full outbound+dwell+inbound arithmetic qualifies same- and different-venue routes exactly once", () => {
  const gapResult = selectWhatFitsGap([
    event({ id: "current", startsAt: "2026-08-29T14:00:00.000Z", endsAt: "2026-08-29T15:00:00.000Z" }),
    event({ id: "next", startsAt: "2026-08-29T17:00:00.000Z", endsAt: "2026-08-29T18:00:00.000Z" }),
  ]);
  assert.equal(gapResult.kind, "eligible");
  if (gapResult.kind !== "eligible") return;
  const fits = candidate("fits");
  const outboundOnly = candidate("outbound-only");
  const dwellFailure = candidate("dwell-failure", "other_food");
  const routes = new Map<string, WhatFitsCandidateRoutes>([
    [fits.id, route(15, 10)],
    [outboundOnly.id, route(50, 20)],
    [dwellFailure.id, route(40, 20)],
  ]);
  const results = qualifyAndRankWhatFitsCandidates(gapResult.gap, [fits, outboundOnly, dwellFailure], routes);
  assert.deepEqual(results.map((row) => row.id), ["fits"]);
  assert.equal(results[0]?.leaveCandidateAt, "2026-08-29T16:20:00.000Z");
  assert.equal(results[0]?.fitMarginMinutes, 40);
});

test("Coffee can fit while Food dwell does not, and a stricter arrival setting can make a route fail", () => {
  const current = event({ id: "current", startsAt: "2026-08-29T14:00:00.000Z", endsAt: "2026-08-29T15:00:00.000Z" });
  const defaultNext = event({ id: "next", startsAt: "2026-08-29T17:00:00.000Z", endsAt: "2026-08-29T18:00:00.000Z", teamArrivalMinutes: 0 });
  const defaultGap = selectWhatFitsGap([current, defaultNext]);
  assert.equal(defaultGap.kind, "eligible");
  if (defaultGap.kind !== "eligible") return;
  const coffee = candidate("coffee", "coffee");
  const food = candidate("food", "other_food");
  const candidateRoutes = new Map([[coffee.id, route(43, 43)], [food.id, route(43, 43)]]);
  assert.deepEqual(qualifyAndRankWhatFitsCandidates(defaultGap.gap, [coffee, food], candidateRoutes).map((row) => row.id), ["coffee"]);

  const stricterGap = selectWhatFitsGap([current, { ...defaultNext, teamArrivalMinutes: 60 }]);
  assert.equal(stricterGap.kind, "eligible");
  if (stricterGap.kind !== "eligible") return;
  assert.deepEqual(qualifyAndRankWhatFitsCandidates(stricterGap.gap, [coffee, food], candidateRoutes), []);
});

test("ranking is deterministic, demotes unknown status, and places brewery below equal Other Food", () => {
  const gapResult = selectWhatFitsGap([
    event({ id: "current", startsAt: "2026-08-29T13:00:00.000Z", endsAt: "2026-08-29T14:00:00.000Z" }),
    event({ id: "next", startsAt: "2026-08-29T18:00:00.000Z", endsAt: "2026-08-29T19:00:00.000Z" }),
  ]);
  assert.equal(gapResult.kind, "eligible");
  if (gapResult.kind !== "eligible") return;
  const other = candidate("other", "other_food");
  const brewery = candidate("brewery", "brewery");
  const unknown = candidate("unknown", "quick_service", { operatingStatus: "status_unknown" });
  const routes = new Map([[other.id, route(10, 10)], [brewery.id, route(10, 10)], [unknown.id, route(1, 1)]]);
  assert.deepEqual(qualifyAndRankWhatFitsCandidates(gapResult.gap, [brewery, unknown, other], routes).map((row) => row.id), ["other", "brewery", "unknown"]);
});

test("route failure excludes only that candidate and expanded output never exceeds ten", () => {
  const gapResult = selectWhatFitsGap([
    event({ id: "current", startsAt: "2026-08-29T10:00:00.000Z", endsAt: "2026-08-29T11:00:00.000Z" }),
    event({ id: "next", startsAt: "2026-08-29T20:00:00.000Z", endsAt: "2026-08-29T21:00:00.000Z" }),
  ]);
  assert.equal(gapResult.kind, "eligible");
  if (gapResult.kind !== "eligible") return;
  const candidates = Array.from({ length: 12 }, (_, index) => candidate(String(index).padStart(2, "0")));
  const routes = new Map(candidates.slice(1).map((row) => [row.id, route(2, 2)]));
  const results = qualifyAndRankWhatFitsCandidates(gapResult.gap, candidates, routes);
  assert.equal(results.length, WHAT_FITS_MAX_RESULTS);
  assert.equal(results.some((row) => row.id === "00"), false);
});

test("fewer than three, exactly three, and expanded results all retain the same fit bar", () => {
  const gapResult = selectWhatFitsGap([
    event({ id: "current", startsAt: "2026-08-29T10:00:00.000Z", endsAt: "2026-08-29T11:00:00.000Z" }),
    event({ id: "next", startsAt: "2026-08-29T20:00:00.000Z", endsAt: "2026-08-29T21:00:00.000Z" }),
  ]);
  assert.equal(gapResult.kind, "eligible");
  if (gapResult.kind !== "eligible") return;
  const candidates = Array.from({ length: 12 }, (_, index) => candidate(String(index).padStart(2, "0")));
  const routes = new Map(candidates.map((row, index) => [row.id, index === 11 ? route(600, 600) : route(3, 3)]));
  assert.equal(qualifyAndRankWhatFitsCandidates(gapResult.gap, candidates.slice(0, 2), routes).length, 2);
  assert.equal(qualifyAndRankWhatFitsCandidates(gapResult.gap, candidates.slice(0, 3), routes).length, 3);
  const expanded = qualifyAndRankWhatFitsCandidates(gapResult.gap, candidates, routes);
  assert.equal(expanded.length, 10);
  assert.equal(expanded.some((row) => row.id === "11"), false);
  assert.equal(expanded.every((row) => row.fitMarginMinutes >= 0), true);
});

test("analytics sanitization drops private and unbounded fields", () => {
  const sanitized = sanitizeWhatFitsAnalytics({
    event: "candidate_selected",
    mode: "food",
    arrivalSource: "team_preference",
    resultCount: 3,
    candidatePosition: 1,
    childName: "Private Child",
    address: "123 Private Street",
  });
  assert.deepEqual(sanitized, {
    event: "candidate_selected",
    mode: "food",
    reason: null,
    arrivalSource: "team_preference",
    resultCount: 3,
    candidatePosition: 1,
  });
  assert.doesNotMatch(JSON.stringify(sanitized), /Private Child|Private Street/);
  assert.equal(sanitizeWhatFitsAnalytics({ event: "made_up", address: "secret" }), null);
  assert.equal(sanitizeWhatFitsAnalytics({
    event: "what_fits_viewed",
    arrivalSource: "source_preference",
  })?.arrivalSource, null);
});
