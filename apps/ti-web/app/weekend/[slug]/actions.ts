"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";
import { saveWeekendPlanForTournament } from "@/lib/weekendPlans";

export type SavePlanState = { status: "idle" | "saved" | "error"; error?: string };

export async function saveWeekendPlanAction(
  params: { tournamentId: string; selectedVenueId: string | null },
  _prevState: SavePlanState,
  _formData: FormData,
): Promise<SavePlanState> {
  const tournamentId = String(params.tournamentId ?? "").trim();
  const selectedVenueId = params.selectedVenueId ? String(params.selectedVenueId).trim() : null;
  if (!tournamentId) return { status: "error", error: "Missing tournament." };

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return { status: "error", error: "Sign in to save this weekend plan." };

  const tierInfo = await getTiTierServer(user);
  const isVerified = !tierInfo.unverified;
  const canSave = isVerified && (tierInfo.tier === "insider" || tierInfo.tier === "weekend_pro");
  if (!canSave) {
    return tierInfo.unverified
      ? { status: "error", error: "Verify your email to save this weekend plan." }
      : { status: "error", error: "Weekend plan saving is unavailable for this account." };
  }

  const res = await saveWeekendPlanForTournament({ userId: user.id, tournamentId, selectedVenueId });
  if (!res.ok) return { status: "error", error: "Could not save your weekend plan. Please try again." };

  // Keep the Weekend Planner hub in sync with anchor updates.
  revalidatePath("/weekend-planner");
  return { status: "saved" };
}
