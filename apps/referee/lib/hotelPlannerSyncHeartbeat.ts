export const HOTEL_SYNC_STALE_RUNNING_MS = 30 * 60 * 1000;
export const HOTEL_SYNC_STALE_SUCCESS_MS = 36 * 60 * 60 * 1000;

export const HOTEL_SYNC_TRIGGERS = ["vercel_cron", "manual_operator"] as const;
export type HotelSyncTrigger = (typeof HOTEL_SYNC_TRIGGERS)[number];

export const HOTEL_SYNC_TERMINAL_STATUSES = ["succeeded", "partial", "failed"] as const;
export type HotelSyncTerminalStatus = (typeof HOTEL_SYNC_TERMINAL_STATUSES)[number];
export type HotelSyncStatus = "running" | HotelSyncTerminalStatus;

export const HOTEL_SYNC_ERROR_STAGES = [
  "provider_request",
  "report_download",
  "report_parse",
  "purchase_upsert",
  "cancellation_request",
  "cancellation_download",
  "cancellation_parse",
  "cancellation_upsert",
  "heartbeat_persistence",
] as const;
export type HotelSyncErrorStage = (typeof HOTEL_SYNC_ERROR_STAGES)[number];

export type HotelSyncRunFinal = {
  status: HotelSyncTerminalStatus;
  purchaseProviderCalls: number;
  purchaseRowsReturned: number;
  cancellationProviderCalls: number;
  cancellationRowsReturned: number;
  rowsUpserted: number;
  rowsFailed: number;
  errorStage: HotelSyncErrorStage | null;
};

export type HotelSyncRunRepository = {
  start(input: {
    trigger: HotelSyncTrigger;
    purchaseWindowStart: string;
    purchaseWindowEnd: string;
  }): Promise<string>;
  finalize(runId: string, result: HotelSyncRunFinal): Promise<boolean>;
};

export type HotelSyncHealthRow = {
  lastAttemptId: string | null;
  lastAttemptStartedAt: string | null;
  lastAttemptCompletedAt: string | null;
  lastAttemptStatus: HotelSyncStatus | null;
  lastAttemptTrigger: HotelSyncTrigger | null;
  lastAttemptPurchaseRows: number;
  lastAttemptCancellationRows: number;
  lastAttemptRowsUpserted: number;
  lastAttemptRowsFailed: number;
  lastAttemptErrorStage: HotelSyncErrorStage | null;
  lastTerminalCompletedAt: string | null;
  lastTerminalStatus: HotelSyncTerminalStatus | null;
  lastSuccessfulCompletedAt: string | null;
  latestPurchasedAt: string | null;
};

export type HotelSyncHealth = HotelSyncHealthRow & {
  attemptState: "never" | "running" | "stale_running" | "terminal";
  lastSuccessState: "never" | "fresh" | "stale";
  lastSuccessAgeHours: number | null;
};

function validTime(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveHotelSyncHealth(row: HotelSyncHealthRow, nowMs = Date.now()): HotelSyncHealth {
  const attemptStarted = validTime(row.lastAttemptStartedAt);
  const successAt = validTime(row.lastSuccessfulCompletedAt);
  let attemptState: HotelSyncHealth["attemptState"] = "never";
  if (row.lastAttemptStatus === "running" && attemptStarted !== null) {
    attemptState = nowMs - attemptStarted > HOTEL_SYNC_STALE_RUNNING_MS ? "stale_running" : "running";
  } else if (row.lastAttemptStatus) {
    attemptState = "terminal";
  }
  const successAgeMs = successAt === null ? null : Math.max(0, nowMs - successAt);
  const lastSuccessState: HotelSyncHealth["lastSuccessState"] = successAgeMs === null
    ? "never"
    : successAgeMs > HOTEL_SYNC_STALE_SUCCESS_MS ? "stale" : "fresh";
  return {
    ...row,
    attemptState,
    lastSuccessState,
    lastSuccessAgeHours: successAgeMs === null ? null : successAgeMs / 3_600_000,
  };
}

export const EMPTY_HOTEL_SYNC_HEALTH_ROW: HotelSyncHealthRow = {
  lastAttemptId: null,
  lastAttemptStartedAt: null,
  lastAttemptCompletedAt: null,
  lastAttemptStatus: null,
  lastAttemptTrigger: null,
  lastAttemptPurchaseRows: 0,
  lastAttemptCancellationRows: 0,
  lastAttemptRowsUpserted: 0,
  lastAttemptRowsFailed: 0,
  lastAttemptErrorStage: null,
  lastTerminalCompletedAt: null,
  lastTerminalStatus: null,
  lastSuccessfulCompletedAt: null,
  latestPurchasedAt: null,
};
