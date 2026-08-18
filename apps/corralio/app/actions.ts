"use server";

import { revalidatePath } from "next/cache";

import { ingestCorralioSchedule } from "@/lib/schedules/ingest";
import { createSupabaseScheduleStore } from "@/lib/schedules/supabaseStore";
import {
  createCorralioSupabaseAdminClient,
  createCorralioSupabaseServerClient,
} from "@/lib/supabase/server";

export type FormState = { status: "idle" | "success" | "error"; message: string };

export async function connectSchedule(_state: FormState, formData: FormData): Promise<FormState> {
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!sourceUrl) return { status: "error", message: "Paste your iCal/ICS calendar URL." };

  try {
    const authenticatedClient = createCorralioSupabaseServerClient();
    const adminClient = createCorralioSupabaseAdminClient();
    const result = await ingestCorralioSchedule(
      createSupabaseScheduleStore(authenticatedClient, adminClient),
      { sourceUrl, displayName },
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

export async function signOut() {
  const supabase = createCorralioSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/");
}
