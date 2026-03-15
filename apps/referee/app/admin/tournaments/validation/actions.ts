"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/admin";
import { runSportValidationBatch } from "@/server/validation/sportValidation";
import { revalidatePath } from "next/cache";

type BulkResult = {
  total_selected: number;
  total_eligible: number;
  total_approved: number;
  total_overwritten: number;
  total_skipped: number;
  errors: string[];
};

type ActionResult = {
  ok: boolean;
  error?: string;
};

async function requeueRows(ids: string[]): Promise<BulkResult> {
  const now = new Date().toISOString();
  let total = 0;
  const errors: string[] = [];

  for (const id of ids) {
    try {
      const { data: row } = await supabaseAdmin
        .from("tournament_sport_validation" as any)
        .select("tournament_id")
        .eq("id", id)
        // casting to any to avoid supabase union-with-error type noise in CI builds
        .maybeSingle<any>();
      const tournamentId = (row as any)?.tournament_id as string | null;
      if (!tournamentId) continue;
      await supabaseAdmin
        .from("tournaments" as any)
        .update({
          revalidate: true,
          sport_validation_status: null,
          sport_validation_method: null,
          sport_validation_rule: null,
          sport_validated_at: null,
          sport_validation_processed_at: now,
        })
        .eq("id", tournamentId);
      await supabaseAdmin
        .from("tournament_sport_validation" as any)
        .update({
          validation_status: "needs_review",
          validation_method: null,
          rule_name: null,
          processed_at: now,
          updated_at: now,
        })
        .eq("id", id);
      total++;
    } catch (err: any) {
      errors.push(err?.message ?? String(err));
    }
  }

  return {
    total_selected: ids.length,
    total_eligible: ids.length,
    total_approved: 0,
    total_overwritten: 0,
    total_skipped: ids.length - total,
    errors,
  };
}

async function bulkUpdate(ids: string[], overwrite: boolean): Promise<BulkResult> {
  const now = new Date().toISOString();
  let totalApproved = 0;
  let totalSkipped = 0;
  let totalOverwritten = 0;
  const errors: string[] = [];

  for (const id of ids) {
    try {
      const { data: row, error: fetchErr } = await supabaseAdmin
        .from("tournament_sport_validation" as any)
        .select("tournament_id,current_sport,validated_sport,validation_status,tournaments!inner(sport)")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr || !row) {
        totalSkipped++;
        if (fetchErr) errors.push(fetchErr.message);
        continue;
      }
      if (["confirmed", "rule_confirmed"].includes(row.validation_status)) {
        totalSkipped++;
        continue;
      }

      const currentSport = (row as any)?.tournaments?.sport ?? row.current_sport ?? null;
      const validatedSport = row.validated_sport || currentSport || null;
      const updates = {
        validation_status: "confirmed",
        validation_method: "manual",
        reviewed_at: now,
        updated_at: now,
        validated_sport: validatedSport ?? row.current_sport ?? null,
      };
      await supabaseAdmin.from("tournament_sport_validation" as any).update(updates).eq("id", id);

      const rollup: Record<string, any> = {
        sport_validation_status: "confirmed",
        sport_validation_method: "manual",
        sport_validated_at: now,
        sport_validation_processed_at: now,
        revalidate: false,
      };

      const sportToApply = validatedSport ?? row.current_sport ?? null;
      if (sportToApply) {
        rollup.validated_sport = sportToApply;
        if (overwrite) {
          rollup.sport = sportToApply;
          totalOverwritten++;
        }
      }

      await supabaseAdmin.from("tournaments" as any).update(rollup).eq("id", row.tournament_id);

      totalApproved++;
    } catch (err: any) {
      errors.push(err?.message ?? String(err));
      totalSkipped++;
      continue;
    }
  }

  return {
    total_selected: ids.length,
    total_eligible: ids.length - totalSkipped,
    total_approved: totalApproved,
    total_overwritten: totalOverwritten,
    total_skipped: totalSkipped,
    errors,
  };
}

export async function bulkApprove(ids: string[]): Promise<BulkResult> {
  await requireAdmin();
  const res = await bulkUpdate(ids, false);
  revalidatePath("/admin/tournaments/validation");
  return res;
}

export async function bulkApproveOverwrite(ids: string[]): Promise<BulkResult> {
  await requireAdmin();
  const res = await bulkUpdate(ids, true);
  revalidatePath("/admin/tournaments/validation");
  return res;
}

export async function bulkRequeue(ids: string[]): Promise<BulkResult> {
  await requireAdmin();
  const res = await requeueRows(ids);
  revalidatePath("/admin/tournaments/validation");
  return res;
}

export async function runBatch(limit?: number) {
  await requireAdmin();
  const effectiveLimit = limit && limit > 0 ? limit : 200;
  const res = await runSportValidationBatch(effectiveLimit);
  revalidatePath("/admin/tournaments/validation");
  return res;
}

// FormData wrappers for server actions
export async function bulkApproveForm(formData: FormData) {
  const ids = formData.getAll("selected").map(String);
  return bulkApprove(ids);
}

export async function bulkApproveOverwriteForm(formData: FormData) {
  const ids = formData.getAll("selected").map(String);
  return bulkApproveOverwrite(ids);
}

export async function bulkRequeueForm(formData: FormData) {
  const ids = formData.getAll("selected").map(String);
  return bulkRequeue(ids);
}

export async function runBatchForm(formData: FormData) {
  const limitRaw = formData.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  return runBatch(limit);
}

export async function approveWithSportForm(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const tournamentId = String(formData.get("tournament_id") ?? "");
  const validationId = String(formData.get("validation_id") ?? "");
  const sport = String(formData.get("validated_sport") ?? "").trim().toLowerCase();
  const overwrite = formData.get("overwrite") === "true";
  if (!tournamentId || !validationId || !sport) return { ok: false, error: "Missing data" };

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("tournament_sport_validation" as any)
    .update({
      validated_sport: sport,
      validation_status: "confirmed",
      validation_method: "manual",
      rule_name: "manual_set",
      reviewed_at: now,
      processed_at: now,
      updated_at: now,
    })
    .eq("id", validationId);

  const rollup: Record<string, any> = {
    validated_sport: sport,
    sport_validation_status: "confirmed",
    sport_validation_method: "manual",
    sport_validation_rule: "manual_set",
    sport_validated_at: now,
    sport_validation_processed_at: now,
    revalidate: false,
  };
  if (overwrite) {
    rollup.sport = sport;
  }

  await supabaseAdmin.from("tournaments" as any).update(rollup).eq("id", tournamentId);
  revalidatePath("/admin/tournaments/validation");
  return { ok: true };
}
