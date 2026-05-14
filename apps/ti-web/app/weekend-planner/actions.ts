"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";
import { archiveWeekendPlan, updateWeekendPlanNotes } from "@/lib/weekendPlans";
import type { SavePlanState } from "@/app/weekend/[slug]/actions";

const MAX_NOTES_CHARS = 3000;

async function requireVerifiedPlannerUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return { ok: false as const, error: "Sign in to manage weekend plans.", userId: null as string | null };

  const tierInfo = await getTiTierServer(user);
  const isVerified = !tierInfo.unverified;
  const canManage = isVerified && (tierInfo.tier === "insider" || tierInfo.tier === "weekend_pro");
  if (!canManage) {
    return tierInfo.unverified
      ? { ok: false as const, error: "Confirm your email to manage weekend plans.", userId: null as string | null }
      : { ok: false as const, error: "Weekend plan management is unavailable for this account.", userId: null as string | null };
  }

  return { ok: true as const, error: null as string | null, userId: user.id };
}

export async function updateWeekendPlanNotesAction(
  params: { planId: string },
  _prevState: SavePlanState,
  formData: FormData,
): Promise<SavePlanState> {
  const planId = String(params.planId ?? "").trim();
  if (!planId) return { status: "error", error: "Missing plan." };

  const authRes = await requireVerifiedPlannerUser();
  if (!authRes.ok || !authRes.userId) return { status: "error", error: authRes.error || "Not authorized." };

  const raw = String(formData.get("notes") ?? "");
  const notes = raw.trim() ? raw.trim() : null;
  if (notes && notes.length > MAX_NOTES_CHARS) {
    return { status: "error", error: `Notes must be ${MAX_NOTES_CHARS} characters or fewer.` };
  }

  const res = await updateWeekendPlanNotes({ userId: authRes.userId, planId, notes });
  if (!res.ok) return { status: "error", error: "Could not save notes. Please try again." };

  revalidatePath("/weekend-planner");
  return { status: "saved" };
}

export async function archiveWeekendPlanAction(
  params: { planId: string },
  _prevState: SavePlanState,
  _formData: FormData,
): Promise<SavePlanState> {
  const planId = String(params.planId ?? "").trim();
  if (!planId) return { status: "error", error: "Missing plan." };

  const authRes = await requireVerifiedPlannerUser();
  if (!authRes.ok || !authRes.userId) return { status: "error", error: authRes.error || "Not authorized." };

  const res = await archiveWeekendPlan({ userId: authRes.userId, planId });
  if (!res.ok) return { status: "error", error: "Could not remove plan. Please try again." };

  revalidatePath("/weekend-planner");
  return { status: "saved" };
}

