import test from "node:test";
import assert from "node:assert/strict";

import {
  collectConfirmedBookingAttributionIds,
  calculateAttributionCoverage,
  classifyHotelPlannerStatus,
  isTournamentInsightsSource,
  reconcileConfirmedBookingAttribution,
  summarizeHotelBookingRows,
} from "./hotelBookingReconciliation";

const MATCHED_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ORPHANED_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const rows = [
  { status: "Confirmed", source: " TournamentInsights ", custom3: `attr:${MATCHED_ID}` },
  { status: "confirmed", source: "tournamentinsights", custom3: `attr:${ORPHANED_ID}` },
  { status: "confirmed", source: "TournamentInsights", custom3: null },
  { status: "confirmed", source: "TournamentInsights", custom3: "not-a-token" },
  { status: "cancelled", source: "TournamentInsights", custom3: `attr:${MATCHED_ID}` },
  { status: "confirmed", source: "AnotherPartner", custom3: `attr:${MATCHED_ID}` },
];

test("classifies confirmed bookings by actual outbound matches", () => {
  const reconciliation = reconcileConfirmedBookingAttribution(rows, new Set([MATCHED_ID]));

  assert.deepEqual(reconciliation, {
    status: "available",
    matchedCount: 1,
    orphanedValidTokenCount: 1,
    missingTokenCount: 1,
    invalidTokenCount: 1,
  });
  assert.equal(
    (reconciliation.matchedCount ?? 0) +
      (reconciliation.orphanedValidTokenCount ?? 0) +
      (reconciliation.missingTokenCount ?? 0) +
      (reconciliation.invalidTokenCount ?? 0),
    4
  );
});

test("collects unique valid tokens from confirmed bookings only", () => {
  assert.deepEqual(collectConfirmedBookingAttributionIds(rows), [MATCHED_ID, ORPHANED_ID]);
});

test("marks reconciliation unavailable without misclassifying valid tokens", () => {
  assert.deepEqual(reconcileConfirmedBookingAttribution(rows, null), {
    status: "unavailable",
    matchedCount: null,
    orphanedValidTokenCount: null,
    missingTokenCount: null,
    invalidTokenCount: null,
  });
});

test("publishes attribution coverage only when outbound reconciliation is available", () => {
  assert.equal(
    calculateAttributionCoverage({
      reconciliationStatus: "unavailable",
      matchedCount: null,
      confirmedTiSourceCount: 10,
    }),
    null
  );
  assert.equal(
    calculateAttributionCoverage({
      reconciliationStatus: "available",
      matchedCount: 2,
      confirmedTiSourceCount: 10,
    }),
    20
  );
});

test("does not let non-confirmed bookings change attribution totals", () => {
  const reconciliation = reconcileConfirmedBookingAttribution(
    [
      { status: "cancelled", source: "TournamentInsights", custom3: null },
      { status: "pending", source: "TournamentInsights", custom3: "invalid" },
    ],
    new Set()
  );

  assert.deepEqual(reconciliation, {
    status: "available",
    matchedCount: 0,
    orphanedValidTokenCount: 0,
    missingTokenCount: 0,
    invalidTokenCount: 0,
  });
});

test("uses exact Source and status cohorts for commercial truth", () => {
  assert.deepEqual(
    summarizeHotelBookingRows([
      { status: "confirmed", source: "TournamentInsights", custom3: null, custom2: "cup-a", total_usd: 125, expected_commission_usd: 12.5, paid_commission_usd: 1 },
      { status: "cancelled", source: " tournamentinsights ", custom3: null, custom2: "cup-a", total_usd: 900, expected_commission_usd: 90, paid_commission_usd: 2 },
      { status: "pending", source: "TOURNAMENTINSIGHTS", custom3: null, custom2: "cup-b", total_usd: 80, expected_commission_usd: 8, paid_commission_usd: 3 },
      { status: null, source: "TournamentInsights", custom3: null, custom2: "cup-c", total_usd: 40, expected_commission_usd: 4, paid_commission_usd: 4 },
      { status: "confirmed", source: "Other", custom3: null, custom2: "cup-z", total_usd: 500, expected_commission_usd: 50, paid_commission_usd: 50 },
    ]),
    {
      confirmedCount: 1,
      cancelledCount: 1,
      otherCount: 1,
      unknownCount: 1,
      confirmedBookingValueUsd: 125,
      confirmedExpectedCommissionUsd: 12.5,
      providerReportedPaidCommissionUsd: 10,
      otherSourceCount: 1,
      topTournamentSlugs: [{ slug: "cup-a", count: 1 }],
    }
  );
});

test("normalizes Source narrowly and does not invent status mappings", () => {
  assert.equal(isTournamentInsightsSource(" TournamentInsights "), true);
  assert.equal(isTournamentInsightsSource("Tournament Insights"), false);
  assert.equal(isTournamentInsightsSource(null), false);
  assert.equal(classifyHotelPlannerStatus("Confirmed"), "confirmed");
  assert.equal(classifyHotelPlannerStatus("Cancelled"), "cancelled");
  assert.equal(classifyHotelPlannerStatus("Cancellation Pending"), "other");
  assert.equal(classifyHotelPlannerStatus(""), "unknown");
});
