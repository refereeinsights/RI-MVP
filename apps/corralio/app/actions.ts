"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { resolveCorralioViewer } from "@/app/_lib/productData";
import { CORRALIO_ACQUISITION_COOKIE, resolveAcquisitionProvenanceCookie } from "@/lib/acquisition";
import { nextChildColor, normalizeFamilyName, parseTeamSport } from "@/lib/family";
import { computeWeekendLeaveBy, saveHouseholdOrigin } from "@/lib/leaveBy.server";
import { isValidUuid, parseScheduleAssignmentInput } from "@/lib/schedules/assignment";
import {
  recordScheduleConnectionInteraction,
  type ScheduleConnectionFailureReason,
  type ScheduleConnectionInteraction,
} from "@/lib/schedules/connectionAnalytics";
import { ingestCorralioSchedule, replaceCorralioSchedule } from "@/lib/schedules/ingest";
import { refreshCorralioScheduleNow } from "@/lib/schedules/manualRefresh.server";
import { parseSchedulePlatform } from "@/lib/schedules/platforms";
import { CORRALIO_MANUAL_REFRESH_COOLDOWN_MINUTES } from "@/lib/schedules/refresh";
import { CORRALIO_SPORTS, parseCorralioSport } from "@/lib/schedules/sport";
import { createSupabaseScheduleStore } from "@/lib/schedules/supabaseStore";
import {
  createCorralioSupabaseAdminClient,
  createCorralioSupabaseServerClient,
} from "@/lib/supabase/server";
import { recordWeeklyEngagement, type EngagementPayload } from "@/lib/weeklyEngagement";
import { computeWhatFits, type WhatFitsServerResult } from "@/lib/whatFits.server";
import { sanitizeWhatFitsAnalytics, type WhatFitsAnalyticsPayload, type WhatFitsMode } from "@/lib/whatFits";

export type FormState = {
  status: "idle" | "success" | "error";
  message: string;
  errorKind?: ScheduleConnectionFailureReason;
  imported?: number;
  retryAt?: string;
};

function revalidatePlanner() {
  revalidatePath("/");
  revalidatePath("/family");
}

async function getOwnerContext() {
  const supabase = createCorralioSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("unauthorized");

  const { data: householdId, error: householdError } = await supabase.rpc("corralio_ensure_owner_household", {
    p_display_name: null,
    p_acquisition_provenance: resolveAcquisitionProvenanceCookie(
      cookies().get(CORRALIO_ACQUISITION_COOKIE)?.value,
    ),
  });
  if (householdError || typeof householdId !== "string") throw new Error("unauthorized");

  return { supabase, householdId };
}

export async function recordWeeklyEngagementAction(payload: EngagementPayload): Promise<void> {
  await recordWeeklyEngagement(
    {
      resolveViewer: resolveCorralioViewer,
      callRpc: async (viewer, sanitizedPayload) => {
        const { error } = await viewer.supabase.rpc("corralio_record_weekly_engagement_v1", {
          p_had_conflict: sanitizedPayload.hadConflict,
          p_conflict_count: sanitizedPayload.conflictCount,
          p_conflict_check_unavailable: sanitizedPayload.conflictCheckUnavailable,
        });
        return { error };
      },
      log: (message) => console.warn(message),
    },
    payload,
  );
}

export async function updateHouseholdOrigin(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const supabase = createCorralioSupabaseServerClient();
    const result = await saveHouseholdOrigin({
      authenticatedClient: supabase,
      submittedAddress: String(formData.get("originAddress") ?? ""),
    });
    revalidatePlanner();
    return { status: result.ok ? "success" : "error", message: result.message };
  } catch {
    return { status: "error", message: "We couldn’t update your home address right now." };
  }
}

export async function computeWeekendLeaveByAction(eventIds: string[]): Promise<{ changed: boolean }> {
  try {
    const viewer = await resolveCorralioViewer();
    if (!viewer?.householdId) return { changed: false };
    const sanitizedIds = Array.from(new Set(eventIds))
      .filter(isValidUuid)
      .slice(0, 200);
    const result = await computeWeekendLeaveBy({
      householdId: viewer.householdId,
      eventIds: sanitizedIds,
    });
    if (result.changed) revalidatePath("/");
    return result;
  } catch {
    console.warn("corralio: leave-by computation failed");
    return { changed: false };
  }
}

export async function computeWhatFitsAction(input: {
  eventIds: string[];
  mode: WhatFitsMode;
  candidateLimitReached: boolean;
}): Promise<WhatFitsServerResult> {
  try {
    const viewer = await resolveCorralioViewer();
    if (!viewer?.householdId) return { kind: "suppressed", reason: "household_conflict" };
    const eventIds = Array.from(new Set(input.eventIds)).filter(isValidUuid).slice(0, 200);
    if (eventIds.length < 2 || (input.mode !== "food" && input.mode !== "coffee")) {
      return { kind: "suppressed", reason: "below_minimum_gap" };
    }
    return await computeWhatFits({
      householdId: viewer.householdId,
      eventIds,
      mode: input.mode,
      candidateLimitReached: input.candidateLimitReached === true,
    });
  } catch {
    console.warn("corralio: what-fits computation failed");
    return { kind: "suppressed", reason: "routing_unavailable" };
  }
}

export async function recordWhatFitsAnalyticsAction(payload: WhatFitsAnalyticsPayload): Promise<void> {
  const sanitized = sanitizeWhatFitsAnalytics(payload);
  if (!sanitized) return;
  try {
    const viewer = await resolveCorralioViewer();
    if (!viewer?.householdId) return;
    await viewer.supabase.rpc("corralio_record_what_fits_event_v1", {
      p_event_name: sanitized.event,
      p_mode: sanitized.mode ?? null,
      p_reason: sanitized.reason ?? null,
      p_arrival_source: sanitized.arrivalSource ?? null,
      p_result_count: sanitized.resultCount ?? null,
      p_candidate_position: sanitized.candidatePosition ?? null,
    });
  } catch {
    // Analytics can never affect the planner and this signal contains no payload data.
  }
}

export async function recordScheduleConnectionInteractionAction(input: unknown): Promise<void> {
  await recordScheduleConnectionInteraction(
    {
      callRpc: async (payload) => {
        const { supabase } = await getOwnerContext();
        const { error } = await supabase.rpc("corralio_record_schedule_connection_event_v1", {
          p_event_name: payload.event,
          p_platform: payload.platform,
          p_reason: payload.reason ?? null,
        });
        return { error };
      },
      log: (message) => console.warn(message),
    },
    input,
  );
}

async function recordConnectionFailure(input: ScheduleConnectionInteraction) {
  await recordScheduleConnectionInteractionAction(input);
}

export async function connectSchedule(_state: FormState, formData: FormData): Promise<FormState> {
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const submittedSport = String(formData.get("sport") ?? "").trim().toLowerCase();
  const platform = parseSchedulePlatform(formData.get("platform"));
  if (!platform) return { status: "error", message: "Choose where this schedule lives." };
  if (!sourceUrl) {
    await recordConnectionFailure({ event: "link_submission_failed", platform, reason: "missing_url" });
    return { status: "error", message: "Paste your calendar link.", errorKind: "missing_url" };
  }
  if (submittedSport && !CORRALIO_SPORTS.includes(submittedSport as (typeof CORRALIO_SPORTS)[number])) {
    await recordConnectionFailure({ event: "link_submission_failed", platform, reason: "invalid_sport" });
    return { status: "error", message: "Choose a valid sport or leave it unselected.", errorKind: "invalid_sport" };
  }

  try {
    const authenticatedClient = createCorralioSupabaseServerClient();
    const adminClient = createCorralioSupabaseAdminClient();
    const result = await ingestCorralioSchedule(
      createSupabaseScheduleStore(authenticatedClient, adminClient),
      { sourceUrl, displayName, sport: parseCorralioSport(submittedSport) },
    );
    if (!result.ok) {
      await recordConnectionFailure({ event: "feed_validation_failed", platform, reason: result.errorKind });
      return { status: "error", message: result.error, errorKind: result.errorKind };
    }
    revalidatePlanner();
    return {
      status: "success",
      message: `Schedule connected — we found ${result.imported} upcoming ${result.imported === 1 ? "event" : "events"}`,
      imported: result.imported,
    };
  } catch {
    await recordConnectionFailure({ event: "feed_validation_failed", platform, reason: "temporary_failure" });
    return {
      status: "error",
      message: "We couldn’t connect that schedule right now. Please try again.",
      errorKind: "temporary_failure",
    };
  }
}

export async function updateScheduleSport(_state: FormState, formData: FormData): Promise<FormState> {
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  const submittedSport = String(formData.get("sport") ?? "").trim().toLowerCase();
  if (!isValidUuid(sourceId)) return { status: "error", message: "That schedule could not be updated." };
  if (submittedSport && !CORRALIO_SPORTS.includes(submittedSport as (typeof CORRALIO_SPORTS)[number])) {
    return { status: "error", message: "Choose a valid sport or leave it unselected." };
  }

  try {
    const supabase = createCorralioSupabaseServerClient();
    const { error } = await supabase.rpc("corralio_update_schedule_source_sport_v1", {
      p_source_id: sourceId,
      p_sport: parseCorralioSport(submittedSport),
    });
    if (error) throw new Error("sport update failed");
    revalidatePlanner();
    return { status: "success", message: "Sport updated." };
  } catch {
    return { status: "error", message: "We couldn’t update that sport right now." };
  }
}

export async function updateScheduleAssignment(_state: FormState, formData: FormData): Promise<FormState> {
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  const assignment = parseScheduleAssignmentInput(formData.get("childId"), formData.get("teamId"));
  if (!isValidUuid(sourceId) || !assignment.ok) {
    return { status: "error", message: "Choose a valid family assignment." };
  }

  try {
    const supabase = createCorralioSupabaseServerClient();
    const { data, error } = await supabase.rpc("corralio_update_schedule_source_assignment_v1", {
      p_source_id: sourceId,
      p_child_id: assignment.childId,
      p_team_id: assignment.teamId,
    });
    if (error || data !== true) throw new Error("assignment update failed");
    revalidatePlanner();
    return {
      status: "success",
      message: assignment.childId ? "Schedule assignment updated." : "Schedule is now unassigned.",
    };
  } catch {
    return { status: "error", message: "We couldn’t update that assignment right now." };
  }
}

export async function disconnectSchedule(_state: FormState, formData: FormData): Promise<FormState> {
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  if (!isValidUuid(sourceId)) return { status: "error", message: "That schedule is unavailable." };

  try {
    const supabase = createCorralioSupabaseServerClient();
    const { data, error } = await supabase.rpc("corralio_disconnect_schedule_source_v1", {
      p_source_id: sourceId,
    });
    if (error || data !== true) throw new Error("schedule unavailable");
    revalidatePlanner();
    return { status: "success", message: "Schedule disconnected." };
  } catch {
    return { status: "error", message: "That schedule is unavailable or was already disconnected." };
  }
}

export async function replaceScheduleLink(_state: FormState, formData: FormData): Promise<FormState> {
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  if (!isValidUuid(sourceId)) return { status: "error", message: "That schedule could not be updated." };
  if (!sourceUrl) return { status: "error", message: "Paste the replacement calendar link." };

  try {
    const authenticatedClient = createCorralioSupabaseServerClient();
    const adminClient = createCorralioSupabaseAdminClient();
    const result = await replaceCorralioSchedule(
      createSupabaseScheduleStore(authenticatedClient, adminClient),
      { sourceId, sourceUrl },
    );
    if (!result.ok) return { status: "error", message: result.error };
    revalidatePlanner();
    return {
      status: "success",
      message: `Calendar link replaced. ${result.imported} upcoming ${result.imported === 1 ? "event" : "events"} imported.`,
    };
  } catch {
    return { status: "error", message: "We couldn’t replace that calendar link right now." };
  }
}

export async function connectTeamSchedule(_state: FormState, formData: FormData): Promise<FormState> {
  const teamId = String(formData.get("teamId") ?? "").trim();
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  if (!isValidUuid(teamId)) return { status: "error", message: "That team could not be found." };
  if (!sourceUrl) return { status: "error", message: "Paste your team’s calendar link." };

  try {
    const { supabase, householdId } = await getOwnerContext();
    const { data: team, error: teamError } = await supabase
      .from("corralio_teams")
      .select("id,child_id,display_name,sport")
      .eq("id", teamId)
      .eq("household_id", householdId)
      .is("archived_at", null)
      .maybeSingle();
    if (teamError || !team || typeof team.child_id !== "string") throw new Error("team unavailable");

    const authenticatedClient = createCorralioSupabaseServerClient();
    const adminClient = createCorralioSupabaseAdminClient();
    const result = await ingestCorralioSchedule(
      createSupabaseScheduleStore(authenticatedClient, adminClient),
      {
        sourceUrl,
        displayName: String(team.display_name ?? ""),
        sport: parseCorralioSport(team.sport),
        assignment: { childId: team.child_id, teamId: team.id },
      },
    );
    if (!result.ok) return { status: "error", message: result.error };
    revalidatePlanner();
    return {
      status: "success",
      message: `Team schedule connected. ${result.imported} upcoming ${result.imported === 1 ? "event" : "events"} imported.`,
    };
  } catch {
    return { status: "error", message: "We couldn’t connect that team schedule right now. Please try again." };
  }
}

export async function createChild(_state: FormState, formData: FormData): Promise<FormState> {
  const displayName = normalizeFamilyName(formData.get("displayName"), 80);
  if (!displayName) return { status: "error", message: "Enter a child name between 1 and 80 characters." };

  try {
    const { supabase, householdId } = await getOwnerContext();
    const [{ data: activeChildren, error: colorError }, { data: lastChild, error: sortError }] = await Promise.all([
      supabase
        .from("corralio_children")
        .select("color_token")
        .eq("household_id", householdId)
        .is("archived_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("corralio_children")
        .select("sort_order")
        .eq("household_id", householdId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (colorError || sortError) throw new Error("child setup failed");

    const colorToken = nextChildColor((activeChildren ?? []).map((child) => child.color_token));
    const sortOrder = typeof lastChild?.sort_order === "number" ? lastChild.sort_order + 1 : 0;
    const { error } = await supabase.from("corralio_children").insert({
      household_id: householdId,
      display_name: displayName,
      color_token: colorToken,
      sort_order: sortOrder,
    });
    if (error) throw new Error("child insert failed");
    revalidatePlanner();
    return { status: "success", message: `${displayName} added.` };
  } catch {
    return { status: "error", message: "We couldn’t add that child right now." };
  }
}

export async function renameChild(_state: FormState, formData: FormData): Promise<FormState> {
  const childId = String(formData.get("childId") ?? "").trim();
  const displayName = normalizeFamilyName(formData.get("displayName"), 80);
  if (!isValidUuid(childId)) return { status: "error", message: "That child could not be updated." };
  if (!displayName) return { status: "error", message: "Enter a child name between 1 and 80 characters." };

  try {
    const { supabase, householdId } = await getOwnerContext();
    const { data, error } = await supabase
      .from("corralio_children")
      .update({ display_name: displayName })
      .eq("id", childId)
      .eq("household_id", householdId)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();
    if (error || !data) throw new Error("child update failed");
    revalidatePlanner();
    return { status: "success", message: "Child updated." };
  } catch {
    return { status: "error", message: "We couldn’t update that child right now." };
  }
}

export async function createTeam(_state: FormState, formData: FormData): Promise<FormState> {
  const childId = String(formData.get("childId") ?? "").trim();
  const displayName = normalizeFamilyName(formData.get("displayName"), 100);
  const sport = parseTeamSport(formData.get("sport"));
  if (!isValidUuid(childId)) return { status: "error", message: "Choose a child for this team." };
  if (!displayName) return { status: "error", message: "Enter a team name between 1 and 100 characters." };
  if (sport === undefined) return { status: "error", message: "Choose a valid sport or leave it unselected." };

  try {
    const { supabase, householdId } = await getOwnerContext();
    const [{ data: child, error: childError }, { data: lastTeam, error: sortError }] = await Promise.all([
      supabase
        .from("corralio_children")
        .select("id")
        .eq("id", childId)
        .eq("household_id", householdId)
        .is("archived_at", null)
        .maybeSingle(),
      supabase
        .from("corralio_teams")
        .select("sort_order")
        .eq("household_id", householdId)
        .eq("child_id", childId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (childError || sortError || !child) throw new Error("team setup failed");

    const sortOrder = typeof lastTeam?.sort_order === "number" ? lastTeam.sort_order + 1 : 0;
    const { error } = await supabase.from("corralio_teams").insert({
      household_id: householdId,
      child_id: childId,
      display_name: displayName,
      sport,
      sort_order: sortOrder,
    });
    if (error) throw new Error("team insert failed");
    revalidatePlanner();
    return { status: "success", message: `${displayName} added.` };
  } catch {
    return { status: "error", message: "We couldn’t add that team right now." };
  }
}

export async function updateTeam(_state: FormState, formData: FormData): Promise<FormState> {
  const teamId = String(formData.get("teamId") ?? "").trim();
  const displayName = normalizeFamilyName(formData.get("displayName"), 100);
  const sport = parseTeamSport(formData.get("sport"));
  const submittedArrival = String(formData.get("arrivalBufferMinutes") ?? "").trim();
  const arrivalBufferMinutes = submittedArrival === "" ? null : Number(submittedArrival);
  if (!isValidUuid(teamId)) return { status: "error", message: "That team could not be updated." };
  if (!displayName) return { status: "error", message: "Enter a team name between 1 and 100 characters." };
  if (sport === undefined) return { status: "error", message: "Choose a valid sport or leave it unselected." };
  if (
    arrivalBufferMinutes !== null
    && (!Number.isInteger(arrivalBufferMinutes) || arrivalBufferMinutes < 0 || arrivalBufferMinutes > 120 || arrivalBufferMinutes % 5 !== 0)
  ) return { status: "error", message: "Choose an arrival setting from 0 to 120 minutes." };

  try {
    const { supabase, householdId } = await getOwnerContext();
    const { data, error } = await supabase
      .from("corralio_teams")
      .update({ display_name: displayName, sport, arrival_buffer_minutes: arrivalBufferMinutes })
      .eq("id", teamId)
      .eq("household_id", householdId)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();
    if (error || !data) throw new Error("team update failed");
    revalidatePlanner();
    await recordWhatFitsAnalyticsAction({ event: "arrival_setting_changed" });
    return { status: "success", message: "Team updated." };
  } catch {
    return { status: "error", message: "We couldn’t update that team right now." };
  }
}

export async function removeTeam(_state: FormState, formData: FormData): Promise<FormState> {
  const teamId = String(formData.get("teamId") ?? "").trim();
  if (!isValidUuid(teamId)) return { status: "error", message: "That team is unavailable." };

  try {
    const supabase = createCorralioSupabaseServerClient();
    const { data, error } = await supabase.rpc("corralio_archive_team_v1", {
      p_team_id: teamId,
    });
    if (error || data !== true) throw new Error("team unavailable");
    revalidatePlanner();
    return { status: "success", message: "Team removed from the family plan." };
  } catch {
    return { status: "error", message: "That team is unavailable or was already removed." };
  }
}

export async function removeChild(_state: FormState, formData: FormData): Promise<FormState> {
  const childId = String(formData.get("childId") ?? "").trim();
  if (!isValidUuid(childId)) return { status: "error", message: "That child is unavailable." };

  try {
    const supabase = createCorralioSupabaseServerClient();
    const { data, error } = await supabase.rpc("corralio_archive_child_v1", {
      p_child_id: childId,
    });
    if (error || data !== true) throw new Error("child unavailable");
    revalidatePlanner();
    return { status: "success", message: "Child removed from the family plan." };
  } catch {
    return { status: "error", message: "That child is unavailable or was already removed." };
  }
}

export async function signOut() {
  const supabase = createCorralioSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/");
}

export async function refreshScheduleNow(_state: FormState, formData: FormData): Promise<FormState> {
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  if (!isValidUuid(sourceId)) return { status: "error", message: "That schedule is unavailable." };

  try {
    const viewer = await resolveCorralioViewer();
    if (!viewer?.householdId) return { status: "error", message: "That schedule is unavailable." };
    const result = await refreshCorralioScheduleNow(
      createCorralioSupabaseAdminClient(),
      { householdId: viewer.householdId, sourceId },
    );
    revalidatePlanner();
    if (result.outcome === "success") {
      return {
        status: "success",
        message: `Schedule checked — ${result.eventCount} upcoming ${result.eventCount === 1 ? "event" : "events"} found`,
        imported: result.eventCount,
        retryAt: new Date(Date.now() + CORRALIO_MANUAL_REFRESH_COOLDOWN_MINUTES * 60_000).toISOString(),
      };
    }
    if (result.outcome === "cooldown") {
      return { status: "error", message: "This schedule was checked recently. Try again in a few minutes." };
    }
    if (result.outcome === "busy") {
      return { status: "error", message: "This schedule is already being checked. Try again shortly." };
    }
    if (result.outcome === "paused") {
      return { status: "error", message: "This schedule needs attention. Replace the calendar link to reconnect updates." };
    }
    if (result.outcome === "failed") {
      return { status: "error", message: "Couldn’t refresh — try again shortly.", retryAt: new Date(Date.now() + CORRALIO_MANUAL_REFRESH_COOLDOWN_MINUTES * 60_000).toISOString() };
    }
    return { status: "error", message: "That schedule is unavailable." };
  } catch {
    console.warn("[corralio][manual-refresh] refresh failed");
    return { status: "error", message: "Couldn’t refresh — try again shortly." };
  }
}
