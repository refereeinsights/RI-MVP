import test from "node:test";
import assert from "node:assert/strict";

import {
  collectConfirmedBookingAttributionIds,
  calculateMatchedBookingConversion,
  reconcileConfirmedBookingAttribution,
  summarizeHotelBookingRows,
} from "./hotelBookingReconciliation";

const MATCHED_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ORPHANED_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const rows = [
  { status: "confirmed", custom3: `attr:${MATCHED_ID}` },
  { status: "confirmed", custom3: `attr:${ORPHANED_ID}` },
  { status: "confirmed", custom3: null },
  { status: "confirmed", custom3: "not-a-token" },
  { status: "cancelled", custom3: `attr:${MATCHED_ID}` },
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
      reconciliation.missingTokenCount +
      reconciliation.invalidTokenCount,
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
    missingTokenCount: 1,
    invalidTokenCount: 1,
  });
});

test("suppresses matched conversion when outbound reconciliation is unavailable", () => {
  assert.equal(
    calculateMatchedBookingConversion({
      reconciliationStatus: "unavailable",
      matchedCount: null,
      handoffCount: 10,
    }),
    null
  );
  assert.equal(
    calculateMatchedBookingConversion({
      reconciliationStatus: "available",
      matchedCount: 2,
      handoffCount: 10,
    }),
    20
  );
});

test("does not let non-confirmed bookings change attribution totals", () => {
  const reconciliation = reconcileConfirmedBookingAttribution(
    [
      { status: "cancelled", custom3: null },
      { status: "pending", custom3: "invalid" },
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

test("preserves booking status, money, and tournament totals", () => {
  assert.deepEqual(
    summarizeHotelBookingRows([
      { status: "confirmed", custom3: null, custom2: "cup-a", total_usd: 125, expected_commission_usd: 12.5 },
      { status: "cancelled", custom3: null, custom2: "cup-a", total_usd: 0, expected_commission_usd: 0 },
      { status: "pending", custom3: null, custom2: "cup-b", total_usd: 80, expected_commission_usd: 8 },
    ]),
    {
      confirmedCount: 1,
      cancelledCount: 1,
      pendingCount: 1,
      totalBookingValueUsd: 205,
      expectedCommissionUsd: 20.5,
      topTournamentSlugs: [
        { slug: "cup-a", count: 2 },
        { slug: "cup-b", count: 1 },
      ],
    }
  );
});
