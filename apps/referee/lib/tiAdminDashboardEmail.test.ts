import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://fixture.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "fixture-service-role-key";

import { deriveHotelSyncHealth, EMPTY_HOTEL_SYNC_HEALTH_ROW } from "./hotelPlannerSyncHeartbeat";
import type { TiAdminDashboardSummary } from "./tiAdminDashboardEmail";

type EmailModule = typeof import("./tiAdminDashboardEmail");
let emailModule: Promise<EmailModule> | null = null;
const loadEmailModule = () => (emailModule ??= import("./tiAdminDashboardEmail"));

function summary(): TiAdminDashboardSummary {
  return {
    windowDays: 7,
    generatedAt: "2026-09-03T06:00:00Z",
    tiles: {},
    hotelHandoffs: { current: 4, prev: 2 },
    traffic: { current: 10, prev: 9 },
    bookings: {
      confirmedCount: 1,
      cancelledCount: 0,
      otherCount: 0,
      unknownCount: 0,
      otherSourceCount: 0,
      reconciliationStatus: "available",
      matchedCount: 1,
      orphanedValidTokenCount: 0,
      missingTokenCount: 0,
      invalidTokenCount: 0,
      confirmedBookingValueUsd: 100,
      confirmedExpectedCommissionUsd: 10,
      providerReportedPaidCommissionUsd: 0,
      topTournamentSlugs: [],
      lastSyncedAt: "2020-01-01T00:00:00Z",
    },
    hotelSyncHealth: deriveHotelSyncHealth({
      ...EMPTY_HOTEL_SYNC_HEALTH_ROW,
      lastAttemptId: "fixture",
      lastAttemptStartedAt: "2026-09-03T05:15:00Z",
      lastAttemptCompletedAt: "2026-09-03T05:16:00Z",
      lastAttemptStatus: "succeeded",
      lastAttemptTrigger: "vercel_cron",
      lastAttemptPurchaseRows: 3,
      lastAttemptCancellationRows: 0,
      lastAttemptRowsUpserted: 3,
      lastTerminalCompletedAt: "2026-09-03T05:16:00Z",
      lastTerminalStatus: "succeeded",
      lastSuccessfulCompletedAt: "2026-09-03T05:16:00Z",
      latestPurchasedAt: "2026-09-02T20:00:00Z",
    }, Date.parse("2026-09-03T06:00:00Z")),
    plannerActivations: 0,
    pending: { pendingContacts: 0, pendingReviews: 0, pendingVerifications: 0 },
  };
}

test("admin email uses the heartbeat rather than booking-row synced_at", async () => {
  const { buildTiAdminDashboardEmail } = await loadEmailModule();
  const rendered = buildTiAdminDashboardEmail(summary());
  assert.match(rendered.text, /4\. HotelPlanner Sync/);
  assert.match(rendered.text, /Status: SUCCEEDED/);
  assert.match(rendered.text, /Purchases returned: 3/);
  assert.doesNotMatch(rendered.text, /2020/);
  assert.match(rendered.text, /Commercial truth: normalized HotelPlanner Source = TournamentInsights/);
  assert.match(rendered.text, /HotelPlanner arrival: UNOBSERVABLE/);
});

test("admin email reports stale running separately from the last successful run", async () => {
  const { buildTiAdminDashboardEmail } = await loadEmailModule();
  const fixture = summary();
  fixture.hotelSyncHealth = deriveHotelSyncHealth({
    ...fixture.hotelSyncHealth,
    lastAttemptStartedAt: "2026-09-03T04:00:00Z",
    lastAttemptCompletedAt: null,
    lastAttemptStatus: "running",
    lastTerminalStatus: "partial",
  }, Date.parse("2026-09-03T06:00:00Z"));
  const rendered = buildTiAdminDashboardEmail(fixture);
  assert.match(rendered.text, /Status: STALE RUNNING/);
  assert.match(rendered.text, /remained running for more than 30 minutes/);
  assert.match(rendered.text, /Last successful sync:/);
});
