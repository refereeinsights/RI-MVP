import { supabaseAdmin } from "./supabaseAdmin";
import {
  EMPTY_HOTEL_SYNC_HEALTH_ROW,
  deriveHotelSyncHealth,
  type HotelSyncHealth,
  type HotelSyncHealthRow,
  type HotelSyncRunFinal,
  type HotelSyncRunRepository,
} from "./hotelPlannerSyncHeartbeat";

export const hotelSyncRunRepository: HotelSyncRunRepository = {
  async start(input) {
    const { data, error } = await (supabaseAdmin as any).rpc("ti_start_hotel_booking_sync_run_v1", {
      p_trigger: input.trigger,
      p_purchase_window_start: input.purchaseWindowStart,
      p_purchase_window_end: input.purchaseWindowEnd,
    });
    if (error || typeof data !== "string") {
      console.error("[hotel-booking-sync] heartbeat start failed");
      throw new Error("HotelPlanner heartbeat persistence failed");
    }
    return data;
  },

  async finalize(runId: string, result: HotelSyncRunFinal) {
    const { data, error } = await (supabaseAdmin as any).rpc("ti_finalize_hotel_booking_sync_run_v1", {
      p_run_id: runId,
      p_status: result.status,
      p_purchase_provider_calls: result.purchaseProviderCalls,
      p_purchase_rows_returned: result.purchaseRowsReturned,
      p_cancellation_provider_calls: result.cancellationProviderCalls,
      p_cancellation_rows_returned: result.cancellationRowsReturned,
      p_rows_upserted: result.rowsUpserted,
      p_rows_failed: result.rowsFailed,
      p_error_stage: result.errorStage,
    });
    if (error) {
      console.error("[hotel-booking-sync] heartbeat finalize failed");
      throw new Error("HotelPlanner heartbeat persistence failed");
    }
    return data === true;
  },
};

type HealthRpcRow = {
  last_attempt_id: string | null;
  last_attempt_started_at: string | null;
  last_attempt_completed_at: string | null;
  last_attempt_status: HotelSyncHealthRow["lastAttemptStatus"];
  last_attempt_trigger: HotelSyncHealthRow["lastAttemptTrigger"];
  last_attempt_purchase_rows: number | null;
  last_attempt_cancellation_rows: number | null;
  last_attempt_rows_upserted: number | null;
  last_attempt_rows_failed: number | null;
  last_attempt_error_stage: HotelSyncHealthRow["lastAttemptErrorStage"];
  last_terminal_completed_at: string | null;
  last_terminal_status: HotelSyncHealthRow["lastTerminalStatus"];
  last_successful_completed_at: string | null;
};

export async function loadHotelSyncHealth(nowMs = Date.now()): Promise<HotelSyncHealth> {
  const [healthResult, purchaseResult] = await Promise.all([
    (supabaseAdmin as any).rpc("ti_read_hotel_booking_sync_health_v1"),
    (supabaseAdmin as any)
      .from("ti_hotel_bookings")
      .select("purchased_at")
      .not("purchased_at", "is", null)
      .order("purchased_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const latestPurchasedAt = purchaseResult.error
    ? null
    : ((purchaseResult.data as { purchased_at: string | null } | null)?.purchased_at ?? null);
  if (healthResult.error) {
    console.error("[hotel-booking-sync] heartbeat health read failed");
    if (purchaseResult.error) console.error("[hotel-booking-sync] latest purchase read failed");
    return deriveHotelSyncHealth({ ...EMPTY_HOTEL_SYNC_HEALTH_ROW, latestPurchasedAt }, nowMs);
  }
  const raw = ((healthResult.data ?? [])[0] ?? null) as HealthRpcRow | null;
  const row: HotelSyncHealthRow = raw ? {
    lastAttemptId: raw.last_attempt_id,
    lastAttemptStartedAt: raw.last_attempt_started_at,
    lastAttemptCompletedAt: raw.last_attempt_completed_at,
    lastAttemptStatus: raw.last_attempt_status,
    lastAttemptTrigger: raw.last_attempt_trigger,
    lastAttemptPurchaseRows: raw.last_attempt_purchase_rows ?? 0,
    lastAttemptCancellationRows: raw.last_attempt_cancellation_rows ?? 0,
    lastAttemptRowsUpserted: raw.last_attempt_rows_upserted ?? 0,
    lastAttemptRowsFailed: raw.last_attempt_rows_failed ?? 0,
    lastAttemptErrorStage: raw.last_attempt_error_stage,
    lastTerminalCompletedAt: raw.last_terminal_completed_at,
    lastTerminalStatus: raw.last_terminal_status,
    lastSuccessfulCompletedAt: raw.last_successful_completed_at,
    latestPurchasedAt,
  } : { ...EMPTY_HOTEL_SYNC_HEALTH_ROW, latestPurchasedAt };
  if (purchaseResult.error) console.error("[hotel-booking-sync] latest purchase read failed");
  return deriveHotelSyncHealth(row, nowMs);
}
