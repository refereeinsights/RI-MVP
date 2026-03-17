"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/admin";

function normalizeEmail(value: FormDataEntryValue | null): string {
  return String(typeof value === "string" ? value : "")
    .trim()
    .toLowerCase();
}

export async function approveTournamentClaimForm(formData: FormData): Promise<void> {
  await requireAdmin();
  const tournamentId = String(formData.get("tournament_id") ?? "").trim();
  const enteredEmail = normalizeEmail(formData.get("entered_email"));
  if (!tournamentId || !enteredEmail) return;

  await (supabaseAdmin.from("tournaments" as any) as any)
    .update({ tournament_director_email: enteredEmail })
    .eq("id", tournamentId);

  // Best-effort: log admin action (requires migration applied).
  try {
    await (supabaseAdmin.from("tournament_claim_events" as any) as any).insert({
      tournament_id: tournamentId,
      event_type: "Tournament Claim Admin Approved",
      entered_email: enteredEmail,
      meta: {},
    });
  } catch {
    // ignore
  }

  revalidatePath("/admin/tournaments/claims");
}

export async function dismissTournamentClaimForm(formData: FormData): Promise<void> {
  await requireAdmin();
  const tournamentId = String(formData.get("tournament_id") ?? "").trim();
  const enteredEmail = normalizeEmail(formData.get("entered_email"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!tournamentId) return;

  try {
    await (supabaseAdmin.from("tournament_claim_events" as any) as any).insert({
      tournament_id: tournamentId,
      event_type: "Tournament Claim Admin Dismissed",
      entered_email: enteredEmail || null,
      meta: reason ? { reason: reason.slice(0, 500) } : {},
    });
  } catch {
    // ignore
  }

  revalidatePath("/admin/tournaments/claims");
}

