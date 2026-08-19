import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CorralioRefreshClaim, CorralioRefreshStore } from "./refresh";

function databaseFailure(stage: string, error: { code?: string } | null) {
  console.warn("[corralio][scheduled-refresh] database operation failed", {
    stage,
    code: error?.code ?? null,
  });
  throw new Error(`Scheduled refresh failed during ${stage}`);
}

function asClaim(value: unknown): CorralioRefreshClaim | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.source_id !== "string" ||
    typeof row.household_id !== "string" ||
    typeof row.source_url !== "string" ||
    typeof row.claim_token !== "string"
  ) return null;
  return {
    sourceId: row.source_id,
    householdId: row.household_id,
    sourceUrl: row.source_url,
    claimToken: row.claim_token,
  };
}

export function createCorralioRefreshSupabaseStore(adminClient: SupabaseClient): CorralioRefreshStore {
  return {
    async claimBatch(limit) {
      const { data, error } = await adminClient.rpc("corralio_claim_ics_refresh_batch_v1", {
        p_limit: limit,
      });
      if (error || !Array.isArray(data)) databaseFailure("claim_batch", error);
      const claims = (data as unknown[]).map(asClaim);
      if (claims.some((claim) => claim === null)) databaseFailure("claim_shape", null);
      return claims as CorralioRefreshClaim[];
    },

    async persistClaimed(input) {
      const { error } = await adminClient.rpc("corralio_persist_claimed_ics_refresh_v1", {
        p_source_id: input.sourceId,
        p_claim_token: input.claimToken,
        p_events: input.events,
        p_canceled_source_event_uids: input.canceledSourceEventUids,
      });
      if (error) databaseFailure("persist_claimed", error);
    },

    async failClaimed(input) {
      const { error } = await adminClient.rpc("corralio_fail_claimed_ics_refresh_v1", {
        p_source_id: input.sourceId,
        p_claim_token: input.claimToken,
        p_failure_code: input.failureCode,
      });
      if (error) databaseFailure("fail_claimed", error);
    },
  };
}
