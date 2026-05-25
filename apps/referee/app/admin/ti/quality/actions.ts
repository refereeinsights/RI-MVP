"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { adminDeleteTournament, requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type FlagStatus = "open" | "closed_validated" | "closed_fixed" | "closed_duplicate";

function asText(value: unknown) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v : null;
}

function asStatus(value: unknown): FlagStatus | null {
  const v = asText(value);
  if (!v) return null;
  if (v === "open") return "open";
  if (v === "closed_validated") return "closed_validated";
  if (v === "closed_fixed") return "closed_fixed";
  if (v === "closed_duplicate") return "closed_duplicate";
  return null;
}

function redirectToQualityWithNotice(params: { status?: string | null; notice: string }) {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  search.set("notice", params.notice);
  redirect(`/admin/ti/quality?${search.toString()}`);
}

export async function setTournamentQualityFlagStatus(formData: FormData) {
  const user = await requireAdmin();

  const flagId = asText(formData.get("flag_id"));
  if (!flagId) throw new Error("Missing flag_id");

  const status = asStatus(formData.get("status"));
  if (!status) throw new Error("Missing status");

  const resolutionNotes = asText(formData.get("resolution_notes")) ?? null;

  const isClosing = status !== "open";

  const patch: Record<string, any> = {
    status,
    resolution_notes: resolutionNotes,
    reviewed_by: isClosing ? user.id : null,
    reviewed_at: isClosing ? new Date().toISOString() : null,
  };

  const { error } = await supabaseAdmin.from("tournament_quality_flags" as any).update(patch).eq("id", flagId);
  if (error) throw error;

  revalidatePath("/admin/ti/quality");
}

export async function deleteTournamentFromQuality(formData: FormData) {
  await requireAdmin();

  const status = asText(formData.get("status"));
  const tournamentId = asText(formData.get("tournament_id"));
  if (!tournamentId) {
    redirectToQualityWithNotice({ status, notice: "Missing tournament_id" });
    return;
  }

  const confirmed = asText(formData.get("confirm_delete")) === "on";
  if (!confirmed) redirectToQualityWithNotice({ status, notice: "Confirm delete to proceed" });

  // Reuse existing safe delete path (does not delete venues; only deletes the tournament row and its dependents).
  await adminDeleteTournament(tournamentId);
  revalidatePath("/admin/ti/quality");
  revalidatePath("/admin");
  revalidatePath("/tournaments");
}

export async function bulkDeleteTournamentsFromQuality(formData: FormData) {
  await requireAdmin();

  const status = asText(formData.get("status"));
  const confirmed = asText(formData.get("confirm_delete")) === "on";
  if (!confirmed) redirectToQualityWithNotice({ status, notice: "Confirm bulk delete to proceed" });

  const rawIds = formData.getAll("tournament_id");
  const tournamentIds = Array.from(
    new Set(rawIds.map((v) => asText(v)).filter((v): v is string => Boolean(v))),
  );
  if (tournamentIds.length === 0) {
    redirectToQualityWithNotice({ status, notice: "Select at least one tournament" });
    return;
  }

  for (const tournamentId of tournamentIds) {
    await adminDeleteTournament(tournamentId);
  }

  revalidatePath("/admin/ti/quality");
  revalidatePath("/admin");
  revalidatePath("/tournaments");
}
