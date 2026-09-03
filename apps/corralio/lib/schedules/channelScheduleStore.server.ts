import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { matchPersistedCorralioEvents } from "../venueMatching.server";
import type { CorralioOwnerContext, CorralioScheduleStore } from "./ingest";

function fail(stage: string): never {
  console.warn("[corralio][channel-schedule-ingestion] database operation failed", { stage });
  throw new Error("Channel schedule ingestion failed");
}

export function createChannelScheduleStore(
  admin: SupabaseClient,
  owner: CorralioOwnerContext,
): CorralioScheduleStore {
  return {
    async resolveOwnerContext() { return owner; },
    async findSourceByUrl(householdId, sourceUrl) {
      const { data, error } = await admin.from("corralio_schedule_sources")
        .select("id,refresh_paused_at").eq("household_id", householdId)
        .eq("source_type", "ics").eq("source_url", sourceUrl)
        .neq("sync_status", "disconnected").order("created_at").limit(1).maybeSingle();
      if (error) fail("find_source");
      return typeof data?.id === "string"
        ? { sourceId: data.id, refreshPaused: typeof data.refresh_paused_at === "string" }
        : null;
    },
    async createSource(input) {
      const { data, error } = await admin.from("corralio_schedule_sources").insert({
        household_id: input.householdId,
        source_type: "ics",
        display_name: input.displayName,
        source_url: input.sourceUrl,
        sport: input.sport,
        child_id: input.teamId ? null : input.childId,
        team_id: input.teamId,
        sync_status: "pending",
      }).select("id").single();
      if (error || typeof data?.id !== "string") fail("create_source");
      return data.id;
    },
    async updateSourceSport(sourceId, sport) {
      const { error } = await admin.from("corralio_schedule_sources").update({ sport }).eq("id", sourceId);
      if (error) fail("update_sport");
    },
    async persistIngestion(input) {
      const { error } = await admin.rpc("corralio_persist_ics_ingestion_v1", {
        p_household_id: input.householdId,
        p_source_id: input.sourceId,
        p_events: input.events,
        p_canceled_source_event_uids: input.canceledSourceEventUids,
      });
      if (error) fail("persist_events");
    },
    async replaceSourceAndPersist() { fail("replace_not_authorized"); },
    async matchPersistedEvents(input) { await matchPersistedCorralioEvents(admin, input); },
    async markSourceError(sourceId, householdId) {
      const { error } = await admin.from("corralio_schedule_sources")
        .update({ sync_status: "error" }).eq("id", sourceId).eq("household_id", householdId);
      if (error) fail("mark_source_error");
    },
  };
}
