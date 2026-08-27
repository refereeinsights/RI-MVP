import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { refreshCorralioClaim } from "./refresh";
import { runManualScheduleRefresh, type ManualScheduleRefreshResult } from "./manualRefresh";
import {
  claimCorralioRefreshSource,
  createCorralioRefreshSupabaseStore,
} from "./refreshSupabaseStore";

export async function refreshCorralioScheduleNow(
  adminClient: SupabaseClient,
  input: { householdId: string; sourceId: string },
): Promise<ManualScheduleRefreshResult> {
  const store = createCorralioRefreshSupabaseStore(adminClient);
  return runManualScheduleRefresh({
    claim: (claimInput) => claimCorralioRefreshSource(adminClient, claimInput),
    refresh: (claim) => refreshCorralioClaim(store, claim),
  }, input);
}
