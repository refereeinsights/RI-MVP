import { loadHotelSyncHealth } from "../../apps/referee/lib/hotelPlannerSyncHeartbeat.server";

async function main() {
  const health = await loadHotelSyncHealth();
  console.log(JSON.stringify({
    lastAttemptStartedAt: health.lastAttemptStartedAt,
    lastAttemptCompletedAt: health.lastAttemptCompletedAt,
    lastAttemptStatus: health.lastAttemptStatus,
    attemptState: health.attemptState,
    lastTerminalCompletedAt: health.lastTerminalCompletedAt,
    lastTerminalStatus: health.lastTerminalStatus,
    lastSuccessfulCompletedAt: health.lastSuccessfulCompletedAt,
    lastSuccessState: health.lastSuccessState,
    lastSuccessAgeHours: health.lastSuccessAgeHours,
    purchaseRowsReturned: health.lastAttemptPurchaseRows,
    cancellationRowsReturned: health.lastAttemptCancellationRows,
    rowsUpserted: health.lastAttemptRowsUpserted,
    rowsFailed: health.lastAttemptRowsFailed,
    errorStage: health.lastAttemptErrorStage,
    latestPurchasedAt: health.latestPurchasedAt,
  }, null, 2));
}

main().catch(() => {
  console.error("HotelPlanner sync-health diagnostic failed");
  process.exitCode = 1;
});
