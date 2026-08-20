"use server";

import { revalidatePath } from "next/cache";

import { nextChildColor, normalizeFamilyName, parseTeamSport } from "@/lib/family";
import { isValidUuid, parseScheduleAssignmentInput } from "@/lib/schedules/assignment";
import { ingestCorralioSchedule, replaceCorralioSchedule } from "@/lib/schedules/ingest";
import { CORRALIO_SPORTS, parseCorralioSport } from "@/lib/schedules/sport";
import { createSupabaseScheduleStore } from "@/lib/schedules/supabaseStore";
import {
  createCorralioSupabaseAdminClient,
  createCorralioSupabaseServerClient,
} from "@/lib/supabase/server";

export type FormState = { status: "idle" | "success" | "error"; message: string };

async function getOwnerContext() {
  const supabase = createCorralioSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("unauthorized");

  const { data: householdId, error: householdError } = await supabase.rpc("corralio_ensure_owner_household", {
    p_display_name: null,
  });
  if (householdError || typeof householdId !== "string") throw new Error("unauthorized");

  return { supabase, householdId };
}

export async function connectSchedule(_state: FormState, formData: FormData): Promise<FormState> {
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const submittedSport = String(formData.get("sport") ?? "").trim().toLowerCase();
  if (!sourceUrl) return { status: "error", message: "Paste your iCal/ICS calendar URL." };
  if (submittedSport && !CORRALIO_SPORTS.includes(submittedSport as (typeof CORRALIO_SPORTS)[number])) {
    return { status: "error", message: "Choose a valid sport or leave it unselected." };
  }

  try {
    const authenticatedClient = createCorralioSupabaseServerClient();
    const adminClient = createCorralioSupabaseAdminClient();
    const result = await ingestCorralioSchedule(
      createSupabaseScheduleStore(authenticatedClient, adminClient),
      { sourceUrl, displayName, sport: parseCorralioSport(submittedSport) },
    );
    if (!result.ok) return { status: "error", message: result.error };
    revalidatePath("/");
    return {
      status: "success",
      message: `Schedule connected. ${result.imported} upcoming ${result.imported === 1 ? "event" : "events"} imported.`,
    };
  } catch {
    return { status: "error", message: "We couldn’t connect that schedule right now. Please try again." };
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
    revalidatePath("/");
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
    revalidatePath("/");
    return {
      status: "success",
      message: assignment.childId ? "Schedule assignment updated." : "Schedule is now unassigned.",
    };
  } catch {
    return { status: "error", message: "We couldn’t update that assignment right now." };
  }
}

export async function replaceScheduleLink(_state: FormState, formData: FormData): Promise<FormState> {
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  if (!isValidUuid(sourceId)) return { status: "error", message: "That schedule could not be updated." };
  if (!sourceUrl) return { status: "error", message: "Paste the replacement iCal/ICS calendar URL." };

  try {
    const authenticatedClient = createCorralioSupabaseServerClient();
    const adminClient = createCorralioSupabaseAdminClient();
    const result = await replaceCorralioSchedule(
      createSupabaseScheduleStore(authenticatedClient, adminClient),
      { sourceId, sourceUrl },
    );
    if (!result.ok) return { status: "error", message: result.error };
    revalidatePath("/");
    return {
      status: "success",
      message: `Calendar link replaced. ${result.imported} upcoming ${result.imported === 1 ? "event" : "events"} imported.`,
    };
  } catch {
    return { status: "error", message: "We couldn’t replace that calendar link right now." };
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
    revalidatePath("/");
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
    revalidatePath("/");
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
    revalidatePath("/");
    return { status: "success", message: `${displayName} added.` };
  } catch {
    return { status: "error", message: "We couldn’t add that team right now." };
  }
}

export async function updateTeam(_state: FormState, formData: FormData): Promise<FormState> {
  const teamId = String(formData.get("teamId") ?? "").trim();
  const displayName = normalizeFamilyName(formData.get("displayName"), 100);
  const sport = parseTeamSport(formData.get("sport"));
  if (!isValidUuid(teamId)) return { status: "error", message: "That team could not be updated." };
  if (!displayName) return { status: "error", message: "Enter a team name between 1 and 100 characters." };
  if (sport === undefined) return { status: "error", message: "Choose a valid sport or leave it unselected." };

  try {
    const { supabase, householdId } = await getOwnerContext();
    const { data, error } = await supabase
      .from("corralio_teams")
      .update({ display_name: displayName, sport })
      .eq("id", teamId)
      .eq("household_id", householdId)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();
    if (error || !data) throw new Error("team update failed");
    revalidatePath("/");
    return { status: "success", message: "Team updated." };
  } catch {
    return { status: "error", message: "We couldn’t update that team right now." };
  }
}

export async function signOut() {
  const supabase = createCorralioSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/");
}
