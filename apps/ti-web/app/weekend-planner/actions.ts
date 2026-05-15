"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";
import { archiveWeekendPlan, updateWeekendPlanLodging, updateWeekendPlanNotes } from "@/lib/weekendPlans";
import type { SavePlanState } from "@/app/weekend/[slug]/actions";

const MAX_NOTES_CHARS = 3000;
const MAX_LODGING_NOTES_CHARS = 3000;

function isValidIsoDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, m, d] = raw.split("-").map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(dt.getTime())) return false;
  return dt.toISOString().slice(0, 10) === raw;
}

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

export async function updateWeekendPlanLodgingAction(
  params: { planId: string },
  _prevState: SavePlanState,
  formData: FormData,
): Promise<SavePlanState> {
  const planId = String(params.planId ?? "").trim();
  if (!planId) return { status: "error", error: "Missing plan." };

  const authRes = await requireVerifiedPlannerUser();
  if (!authRes.ok || !authRes.userId) return { status: "error", error: authRes.error || "Not authorized." };

  const lodgingName = String(formData.get("lodging_name") ?? "").trim() || null;
  const lodgingAddress = String(formData.get("lodging_address") ?? "").trim() || null;
  const checkInDate = String(formData.get("check_in_date") ?? "").trim() || null;
  const checkOutDate = String(formData.get("check_out_date") ?? "").trim() || null;
  const rawNotes = String(formData.get("lodging_notes") ?? "");
  const lodgingNotes = rawNotes.trim() ? rawNotes.trim() : null;

  if (lodgingNotes && lodgingNotes.length > MAX_LODGING_NOTES_CHARS) {
    return { status: "error", error: `Lodging notes must be ${MAX_LODGING_NOTES_CHARS} characters or fewer.` };
  }

  if (!isValidIsoDate(checkInDate) || !isValidIsoDate(checkOutDate)) {
    return { status: "error", error: "Check-in and check-out dates must be valid dates." };
  }

  const res = await updateWeekendPlanLodging({
    userId: authRes.userId,
    planId,
    lodgingName,
    lodgingAddress,
    checkInDate,
    checkOutDate,
    lodgingNotes,
  });
  if (!res.ok) return { status: "error", error: "Could not save lodging details. Please try again." };

  revalidatePath("/weekend-planner");
  return { status: "saved" };
}
