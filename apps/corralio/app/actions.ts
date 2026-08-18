"use server";

import { revalidatePath } from "next/cache";

import { ingestCorralioSchedule, replaceCorralioSchedule } from "@/lib/schedules/ingest";
import { CORRALIO_SPORTS, parseCorralioSport } from "@/lib/schedules/sport";
import { createSupabaseScheduleStore } from "@/lib/schedules/supabaseStore";
import {
  createCorralioSupabaseAdminClient,
  createCorralioSupabaseServerClient,
} from "@/lib/supabase/server";

export type FormState = { status: "idle" | "success" | "error"; message: string };

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
  if (!validUuid(sourceId)) return { status: "error", message: "That schedule could not be updated." };
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

export async function replaceScheduleLink(_state: FormState, formData: FormData): Promise<FormState> {
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  if (!validUuid(sourceId)) return { status: "error", message: "That schedule could not be updated." };
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

export async function signOut() {
  const supabase = createCorralioSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/");
}
