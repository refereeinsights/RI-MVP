import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CorralioScheduleStore } from "./ingest";

function databaseFailure(stage: string, error: { code?: string } | null) {
  // Never log the feed URL, event payload, upstream response, or database message.
  console.warn("[corralio][schedule-ingestion] database operation failed", {
    stage,
    code: error?.code ?? null,
  });
  throw new Error(`Schedule ingestion failed during ${stage}`);
}

export function createSupabaseScheduleStore(
  authenticatedClient: SupabaseClient,
  adminClient: SupabaseClient,
): CorralioScheduleStore {
  return {
    async resolveOwnerContext() {
      const {
        data: { user },
        error: authError,
      } = await authenticatedClient.auth.getUser();
      if (authError || !user) return null;

      const { data, error } = await authenticatedClient.rpc("corralio_ensure_owner_household", {
        p_display_name: null,
      });
      if (error || typeof data !== "string") databaseFailure("owner_household", error);
      return { userId: user.id, householdId: data as string };
    },

    async findSourceByUrl(householdId, sourceUrl) {
      const { data, error } = await adminClient
        .from("corralio_schedule_sources")
        .select("id,refresh_paused_at")
        .eq("household_id", householdId)
        .eq("source_type", "ics")
        .eq("source_url", sourceUrl)
        .neq("sync_status", "disconnected")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) databaseFailure("find_source", error);
      return typeof data?.id === "string"
        ? { sourceId: data.id, refreshPaused: typeof data.refresh_paused_at === "string" }
        : null;
    },

    async createSource(input) {
      const { data, error } = await authenticatedClient.rpc("corralio_create_schedule_source_v2", {
        p_household_id: input.householdId,
        p_display_name: input.displayName,
        p_source_url: input.sourceUrl,
        p_sport: input.sport,
        p_child_id: null,
        p_team_id: null,
      });
      if (error || typeof data !== "string") databaseFailure("create_source", error);
      return data as string;
    },

    async updateSourceSport(sourceId, sport) {
      const { error } = await authenticatedClient.rpc("corralio_update_schedule_source_sport_v1", {
        p_source_id: sourceId,
        p_sport: sport,
      });
      if (error) databaseFailure("update_source_sport", error);
    },

    async persistIngestion(input) {
      const { error } = await adminClient.rpc("corralio_persist_ics_ingestion_v1", {
        p_household_id: input.householdId,
        p_source_id: input.sourceId,
        p_events: input.events,
        p_canceled_source_event_uids: input.canceledSourceEventUids,
      });
      if (error) databaseFailure("persist_events", error);
    },

    async replaceSourceAndPersist(input) {
      const { error } = await adminClient.rpc("corralio_replace_schedule_source_and_persist_ics_v1", {
        p_household_id: input.householdId,
        p_source_id: input.sourceId,
        p_source_url: input.sourceUrl,
        p_events: input.events,
        p_canceled_source_event_uids: input.canceledSourceEventUids,
      });
      if (error) databaseFailure("replace_source", error);
    },

    async markSourceError(sourceId, householdId) {
      const { error } = await adminClient
        .from("corralio_schedule_sources")
        .update({ sync_status: "error" })
        .eq("id", sourceId)
        .eq("household_id", householdId);
      if (error) databaseFailure("mark_source_error", error);
    },
  };
}
