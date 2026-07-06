import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { refreshIcsSource } from "@/lib/planner/ics-import";

const STALE_AFTER_HOURS = 6;
const MAX_SOURCES_PER_RUN = 25;

type PlannerSourceRefreshRow = {
  id: string;
  user_id: string;
  source_name: string | null;
  team_name: string | null;
  source_url: string | null;
  last_synced_at: string | null;
  created_at: string | null;
};

function isDueForRefresh(row: PlannerSourceRefreshRow, cutoffMs: number) {
  const syncedAtMs = row.last_synced_at ? new Date(row.last_synced_at).getTime() : NaN;
  if (!Number.isFinite(syncedAtMs)) return true;
  return syncedAtMs <= cutoffMs;
}

function displayNameForSource(row: PlannerSourceRefreshRow) {
  return String(row.source_name ?? "").trim() || String(row.team_name ?? "").trim() || "Connected calendar";
}

export async function runPlannerCalendarRefreshCronJob() {
  const cutoffMs = Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000;

  const { data, error } = await (supabaseAdmin.from("planner_event_sources" as any) as any)
    .select("id,user_id,source_name,team_name,source_url,last_synced_at,created_at")
    .eq("source_type", "ics")
    .not("source_url", "is", null)
    .limit(200);

  if (error) {
    return { ok: false, error: error.message };
  }

  const dueSources = ((data ?? []) as PlannerSourceRefreshRow[])
    .filter((row) => String(row.user_id ?? "").trim() && String(row.id ?? "").trim())
    .filter((row) => isDueForRefresh(row, cutoffMs))
    .sort((a, b) => {
      const aMs = a.last_synced_at ? new Date(a.last_synced_at).getTime() : 0;
      const bMs = b.last_synced_at ? new Date(b.last_synced_at).getTime() : 0;
      return aMs - bMs;
    })
    .slice(0, MAX_SOURCES_PER_RUN);

  let refreshed = 0;
  let skipped = 0;
  let failed = 0;
  const errors: Array<{ source_id: string; label: string; error: string }> = [];

  if (!dueSources.length) {
    return {
      ok: true,
      stale_after_hours: STALE_AFTER_HOURS,
      processed_limit: MAX_SOURCES_PER_RUN,
      total_sources: (data ?? []).length,
      due_sources: 0,
      refreshed: 0,
      skipped: 0,
      failed: 0,
      errors,
    };
  }

  for (const row of dueSources) {
    const result = await refreshIcsSource({
      supabase: supabaseAdmin as any,
      userId: row.user_id,
      sourceId: row.id,
    });

    if (result.ok) {
      refreshed += 1;
      continue;
    }

    if (result.status === 404) {
      skipped += 1;
      continue;
    }

    failed += 1;
    errors.push({
      source_id: row.id,
      label: displayNameForSource(row),
      error: String(result.error ?? "refresh_failed"),
    });
  }

  return {
    ok: true,
    stale_after_hours: STALE_AFTER_HOURS,
    processed_limit: MAX_SOURCES_PER_RUN,
    total_sources: (data ?? []).length,
    due_sources: dueSources.length,
    refreshed,
    skipped,
    failed,
    errors,
  };
}
