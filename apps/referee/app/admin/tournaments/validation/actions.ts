"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/admin";

type BulkResult = {
  total_selected: number;
  total_eligible: number;
  total_approved: number;
  total_overwritten: number;
  total_skipped: number;
  errors: string[];
};

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
        .select("tournament_id,validated_sport,validation_status")
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

      const updates = {
        validation_status: "confirmed",
        validation_method: "manual",
        reviewed_at: now,
        updated_at: now,
      };
      await supabaseAdmin.from("tournament_sport_validation" as any).update(updates).eq("id", id);

      const rollup: Record<string, any> = {
        sport_validation_status: "confirmed",
        sport_validation_method: "manual",
        sport_validated_at: now,
        sport_validation_processed_at: now,
        revalidate: false,
      };

      if (row.validated_sport) {
        rollup.validated_sport = row.validated_sport;
        if (overwrite) {
          rollup.sport = row.validated_sport;
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
  return bulkUpdate(ids, false);
}

export async function bulkApproveOverwrite(ids: string[]): Promise<BulkResult> {
  await requireAdmin();
  return bulkUpdate(ids, true);
}
