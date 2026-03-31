import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runSavedTournamentChangeNotificationsJob } from "@/lib/savedTournamentChangeNotificationsJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const LOCK_KEY = "ti_saved_tournament_changes_v1";

function isAuthorized(req: Request) {
  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  const tokenFromHeader = req.headers.get("x-cron-secret");
  const token = (tokenFromQuery ?? tokenFromHeader ?? "").trim();
  return Boolean(process.env.CRON_SECRET && token && token === process.env.CRON_SECRET);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { data: lock, error: lockError } = await (supabaseAdmin as any).rpc("acquire_cron_job_lock", {
    p_key: LOCK_KEY,
    p_ttl_seconds: 10 * 60,
  });
  if (lockError) {
    return NextResponse.json({ ok: false, error: lockError.message }, { status: 500 });
  }
  if (!lock) {
    return NextResponse.json({ ok: true, skipped: true, reason: "lock_held" });
  }

  try {
    const result = await runSavedTournamentChangeNotificationsJob();
    return NextResponse.json(result);
  } finally {
    try {
      await (supabaseAdmin as any).rpc("release_cron_job_lock", { p_key: LOCK_KEY });
    } catch {
      // Best-effort unlock: TTL will eventually expire.
    }
  }
}

