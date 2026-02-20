import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type OwlRunRow = {
  id?: string | null;
  run_id?: string | null;
  venue_id: string;
  sport?: string | null;
  status?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

async function ensureAdminRequest() {
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

async function fetchLatestRun(venueId: string) {
  const primary = await supabaseAdmin
    .from("owls_eye_runs" as any)
    .select("id,run_id,venue_id,sport,status,updated_at,created_at")
    .eq("venue_id", venueId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<OwlRunRow>();
  if (!primary.error) return primary.data ?? null;

  if (primary.error.code === "42703" || primary.error.code === "PGRST204") {
    const fallback = await supabaseAdmin
      .from("owls_eye_runs" as any)
      .select("id,run_id,venue_id,sport,status,created_at")
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<OwlRunRow>();
    return fallback.data ?? null;
  }
  throw primary.error;
}

async function ensureRunForVenue(venueId: string): Promise<{ runId: string; sport: string }> {
  const existing = await fetchLatestRun(venueId);
  if (existing) {
    return {
      runId: (existing.run_id ?? existing.id) as string,
      sport: existing.sport === "basketball" ? "basketball" : "soccer",
    };
  }

  const { data: venue } = await supabaseAdmin.from("venues" as any).select("sport").eq("id", venueId).maybeSingle();
  const venueSport = ((venue as any)?.sport ?? "").toLowerCase();
  const sport = venueSport === "basketball" ? "basketball" : "soccer";
  const runId = randomUUID();
  const nowIso = new Date().toISOString();

  const insertPayload = {
    id: runId,
    run_id: runId,
    venue_id: venueId,
    sport,
    run_type: "manual_override",
    status: "complete",
    created_at: nowIso,
    updated_at: nowIso,
    completed_at: nowIso,
  };
  const insertResp = await supabaseAdmin.from("owls_eye_runs" as any).upsert(insertPayload);
  if (insertResp.error && (insertResp.error.code === "42703" || insertResp.error.code === "PGRST204")) {
    const fallbackPayload = {
      id: runId,
      venue_id: venueId,
      sport,
      run_type: "manual_override",
      status: "complete",
      created_at: nowIso,
      completed_at: nowIso,
    };
    const fallbackResp = await supabaseAdmin.from("owls_eye_runs" as any).upsert(fallbackPayload);
    if (fallbackResp.error) throw fallbackResp.error;
  } else if (insertResp.error) {
    throw insertResp.error;
  }

  return { runId, sport };
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const mapUrl = typeof payload?.map_url === "string" ? payload.map_url.trim() : "";
  if (!mapUrl) {
    return NextResponse.json({ error: "map_url_required" }, { status: 400 });
  }

  const venueId = params.id;
  try {
    const run = await ensureRunForVenue(venueId);
    const nowIso = new Date().toISOString();

    const existingMap = await supabaseAdmin
      .from("owls_eye_map_artifacts" as any)
      .select("id,run_id,image_url")
      .eq("run_id", run.runId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; run_id: string; image_url: string }>();

    if (existingMap.data?.id) {
      const updateResp = await supabaseAdmin
        .from("owls_eye_map_artifacts" as any)
        .update({ image_url: mapUrl })
        .eq("id", existingMap.data.id);
      if (updateResp.error) throw updateResp.error;
    } else {
      const insertResp = await supabaseAdmin.from("owls_eye_map_artifacts" as any).insert({
        id: randomUUID(),
        run_id: run.runId,
        map_kind: `${run.sport}_field_map`,
        image_url: mapUrl,
        created_at: nowIso,
      });
      if (insertResp.error) throw insertResp.error;
    }

    return NextResponse.json({ ok: true, run_id: run.runId, map_url: mapUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "owl_eye_map_update_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
