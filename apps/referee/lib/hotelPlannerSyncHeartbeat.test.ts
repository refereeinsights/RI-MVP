import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://fixture.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "fixture-service-role-key";

import {
  EMPTY_HOTEL_SYNC_HEALTH_ROW,
  deriveHotelSyncHealth,
  type HotelSyncRunFinal,
  type HotelSyncRunRepository,
} from "./hotelPlannerSyncHeartbeat";
import { executeTiAdminDashboardCron } from "./tiAdminDashboardCron";

type BookingSyncModule = typeof import("./hotelPlannerBookingSync");
let modulePromise: Promise<BookingSyncModule> | null = null;
const loadBookingSync = () => (modulePromise ??= import("./hotelPlannerBookingSync"));
type BookingRow = import("./hotelPlannerBookingSync").BookingRow;

function recorder() {
  const starts: unknown[] = [];
  const finals: HotelSyncRunFinal[] = [];
  const repository: HotelSyncRunRepository = {
    async start(input) { starts.push(input); return "fixture-run-id"; },
    async finalize(_runId, result) { finals.push(result); return true; },
  };
  return { repository, starts, finals };
}

const report = { recordCount: 0, downloadUrl: "https://fixture.invalid/report", fileName: "fixture.xlsx" };

test("zero-row purchase and cancellation reports create a successful terminal run", async () => {
  const { executeHotelPlannerBookingSync } = await loadBookingSync();
  const recorded = recorder();
  const result = await executeHotelPlannerBookingSync({
    lookbackDays: 7,
    trigger: "vercel_cron",
    dependencies: {
      now: new Date("2026-09-03T05:15:00Z"),
      repository: recorded.repository,
      fetchRows: async () => ({ report, rows: [] }),
      persistRows: async () => ({ inserted: 0, errors: 0 }),
    },
  });
  assert.equal(recorded.starts.length, 1);
  assert.equal(result.parsed, 0);
  assert.deepEqual(recorded.finals, [{
    status: "succeeded",
    purchaseProviderCalls: 1,
    purchaseRowsReturned: 0,
    cancellationProviderCalls: 1,
    cancellationRowsReturned: 0,
    rowsUpserted: 0,
    rowsFailed: 0,
    errorStage: null,
  }]);
});

test("purchase failure finalizes failed before surfacing a bounded error", async () => {
  const { executeHotelPlannerBookingSync, HotelSyncStageFailure } = await loadBookingSync();
  const recorded = recorder();
  await assert.rejects(() => executeHotelPlannerBookingSync({
    lookbackDays: 7,
    trigger: "vercel_cron",
    dependencies: {
      now: new Date("2026-09-03T05:15:00Z"),
      repository: recorded.repository,
      fetchRows: async () => { throw new HotelSyncStageFailure("report_download"); },
      persistRows: async () => ({ inserted: 0, errors: 0 }),
    },
  }), /purchase sync failed/);
  assert.equal(recorded.finals.length, 1);
  assert.equal(recorded.finals[0].status, "failed");
  assert.equal(recorded.finals[0].errorStage, "report_download");
  assert.equal(recorded.finals[0].cancellationProviderCalls, 0);
});

test("cancellation failure after purchase success is partial", async () => {
  const { executeHotelPlannerBookingSync, HotelSyncStageFailure } = await loadBookingSync();
  const recorded = recorder();
  let calls = 0;
  const original = console.error;
  console.error = () => {};
  try {
    const result = await executeHotelPlannerBookingSync({
      lookbackDays: 7,
      trigger: "manual_operator",
      dependencies: {
        now: new Date("2026-09-03T05:15:00Z"),
        repository: recorded.repository,
        fetchRows: async () => {
          calls += 1;
          if (calls === 2) throw new HotelSyncStageFailure("cancellation_parse");
          return { report: { ...report, recordCount: 1 }, rows: [{} as BookingRow] };
        },
        persistRows: async rows => ({ inserted: rows.length, errors: 0 }),
      },
    });
    assert.equal(result.cancellationRefresh, "failed");
    assert.equal(recorded.finals[0].status, "partial");
    assert.equal(recorded.finals[0].errorStage, "cancellation_parse");
    assert.equal(recorded.finals[0].rowsUpserted, 1);
  } finally {
    console.error = original;
  }
});

test("successful non-empty purchase and cancellation reports record aggregate rows", async () => {
  const { executeHotelPlannerBookingSync } = await loadBookingSync();
  const recorded = recorder();
  const row = {} as BookingRow;
  const result = await executeHotelPlannerBookingSync({
    lookbackDays: 7,
    trigger: "vercel_cron",
    dependencies: {
      now: new Date("2026-09-03T05:15:00Z"),
      repository: recorded.repository,
      fetchRows: async (_start, _end, field) => ({
        report: { ...report, recordCount: field === "purchased" ? 2 : 1 },
        rows: field === "purchased" ? [row, row] : [row],
      }),
      persistRows: async rows => ({ inserted: rows.length, errors: 0 }),
    },
  });
  assert.equal(result.inserted, 3);
  assert.equal(recorded.finals[0].status, "succeeded");
  assert.equal(recorded.finals[0].purchaseRowsReturned, 2);
  assert.equal(recorded.finals[0].cancellationRowsReturned, 1);
  assert.equal(recorded.finals[0].rowsUpserted, 3);
});

test("a thrown cancellation upsert records partial failure aggregates", async () => {
  const { executeHotelPlannerBookingSync } = await loadBookingSync();
  const recorded = recorder();
  const row = {} as BookingRow;
  const original = console.error;
  console.error = () => {};
  try {
    const result = await executeHotelPlannerBookingSync({
      lookbackDays: 7,
      trigger: "vercel_cron",
      dependencies: {
        now: new Date("2026-09-03T05:15:00Z"),
        repository: recorded.repository,
        fetchRows: async () => ({ report, rows: [row, row] }),
        persistRows: async (rows, _at, mode) => {
          if (mode === "cancellation") throw new Error("private database detail");
          return { inserted: rows.length, errors: 0 };
        },
      },
    });
    assert.equal(result.errors, 2);
    assert.equal(recorded.finals[0].status, "partial");
    assert.equal(recorded.finals[0].errorStage, "cancellation_upsert");
    assert.equal(recorded.finals[0].rowsFailed, 2);
  } finally {
    console.error = original;
  }
});

test("row-upsert failures are aggregated without hiding successful provider calls", async () => {
  const { executeHotelPlannerBookingSync } = await loadBookingSync();
  const recorded = recorder();
  const row = {} as BookingRow;
  const result = await executeHotelPlannerBookingSync({
    lookbackDays: 7,
    trigger: "vercel_cron",
    dependencies: {
      now: new Date("2026-09-03T05:15:00Z"),
      repository: recorded.repository,
      fetchRows: async (_start, _end, field) => ({ report, rows: field === "purchased" ? [row, row] : [] }),
      persistRows: async (rows, _at, mode) => mode === "purchase"
        ? { inserted: 1, errors: 1 }
        : { inserted: rows.length, errors: 0 },
    },
  });
  assert.equal(result.errors, 1);
  assert.equal(recorded.finals[0].status, "partial");
  assert.equal(recorded.finals[0].errorStage, "purchase_upsert");
  assert.equal(recorded.finals[0].rowsFailed, 1);
});

test("health calculation distinguishes running, stale running, and stale success", () => {
  const base = {
    ...EMPTY_HOTEL_SYNC_HEALTH_ROW,
    lastAttemptId: "fixture",
    lastAttemptStartedAt: "2026-09-03T05:00:00Z",
    lastAttemptStatus: "running" as const,
    lastSuccessfulCompletedAt: "2026-09-01T05:00:00Z",
  };
  assert.equal(deriveHotelSyncHealth(base, Date.parse("2026-09-03T05:20:00Z")).attemptState, "running");
  const stale = deriveHotelSyncHealth(base, Date.parse("2026-09-03T05:31:00Z"));
  assert.equal(stale.attemptState, "stale_running");
  assert.equal(stale.lastSuccessState, "stale");
});

test("email success cannot erase or relabel a booking-sync failure", async () => {
  let logged = 0;
  const result = await executeTiAdminDashboardCron({
    syncBookings: async () => { throw new Error("private provider detail"); },
    sendEmail: async () => ({ recipients: 1 }),
    logSyncFailure: () => { logged += 1; },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.bookingSync, { error: "booking_sync_failed" });
  assert.equal(logged, 1);
});
