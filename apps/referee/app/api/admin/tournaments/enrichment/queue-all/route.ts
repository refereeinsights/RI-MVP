import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  queueEnrichmentJobs,
  runEnrichmentForTournamentIds,
  runQueuedEnrichment,
} from "@/server/enrichment/pipeline";

async function ensureAdmin() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") return null;
  return data.user;
}

export async function POST(request: Request) {
  const admin = await ensureAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const limit = Math.max(1, Math.min(200, Number(body?.limit ?? 50)));
  const missingDatesOnly = body?.missing_dates_only === true;
  const deepDateSearch = body?.deep_date_search === true;

  let query = supabaseAdmin
    .from("tournaments" as any)
    .select("id,official_website_url,source_url,enrichment_skip,start_date,end_date")
    .eq("enrichment_skip", false)
    .or("official_website_url.not.is.null,source_url.not.is.null")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (missingDatesOnly) {
    query = query.is("start_date", null).is("end_date", null);
  }
  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message ?? "fetch_failed" }, { status: 500 });
  }
  const tournamentIds = (rows ?? []).map((r: any) => r.id);
  if (!tournamentIds.length) {
    return NextResponse.json({ queued: 0, ran: 0 });
  }

  if (missingDatesOnly || deepDateSearch) {
    const results = await runEnrichmentForTournamentIds(tournamentIds, {
      maxPages: 16,
      dateFocus: true,
    });
    const done = results.filter((r) => r.status === "done").length;
    const errors = results.filter((r) => r.status === "error");
    return NextResponse.json({
      queued: tournamentIds.length,
      ran: results.length,
      done,
      errors,
      mode: "deep_date_search",
    });
  }

  await queueEnrichmentJobs(tournamentIds);
  const ran = await runQueuedEnrichment(Math.min(20, tournamentIds.length));
  return NextResponse.json({ queued: tournamentIds.length, ran: ran.length });
}
