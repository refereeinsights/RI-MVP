import type { CorralioRefreshClaim, CorralioSingleRefreshResult } from "./refresh";
import type { CorralioManualClaimResult } from "./refreshSupabaseStore";

export type ManualScheduleRefreshResult =
  | { outcome: "success"; eventCount: number }
  | { outcome: "failed" | "cooldown" | "busy" | "paused" | "unavailable" };

export async function runManualScheduleRefresh(
  dependencies: {
    claim(input: { householdId: string; sourceId: string }): Promise<CorralioManualClaimResult>;
    refresh(claim: CorralioRefreshClaim): Promise<CorralioSingleRefreshResult>;
  },
  input: { householdId: string; sourceId: string },
): Promise<ManualScheduleRefreshResult> {
  const claimed = await dependencies.claim(input);
  if (claimed.outcome !== "claimed") return { outcome: claimed.outcome };
  const result = await dependencies.refresh(claimed.claim);
  if (result.status === "success") return { outcome: "success", eventCount: result.eventCount };
  return { outcome: "failed" };
}
