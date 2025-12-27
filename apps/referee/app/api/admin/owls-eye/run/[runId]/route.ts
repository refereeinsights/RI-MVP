import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "../../../../../../RI_Backend/src/lib/supabase";
import { SportType } from "../../../../../../RI_Backend/src/owlseye/types";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function fetchRun(runId: string) {
  const supabase = getSupabaseAdminClient();
  const runResp = await supabase.from("owlseye_runs").select("*").eq("run_id", runId).maybeSingle();
  if (runResp.error && runResp.error.code !== "42P01") throw runResp.error;
  const run = runResp.data;
  if (!run) return null;

  const artifactsResp = await supabase
    .from("owls_eye_map_artifacts")
    .select("*")
    .eq("venue_id", run.venue_id)
    .eq("sport", run.sport as SportType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (artifactsResp.error && artifactsResp.error.code !== "42P01") throw artifactsResp.error;
  const artifacts = artifactsResp.data ? [artifactsResp.data] : [];
  return { run, artifacts, annotations: [], nearby_food: [] };
}

export async function GET(_request: Request, context: { params: { runId: string } }) {
  const runId = context.params.runId;
  if (!runId || !isUuid(runId)) {
    return NextResponse.json({ error: "invalid_run_id" }, { status: 400 });
  }

  try {
    const payload = await fetchRun(runId);
    if (!payload) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: "lookup_failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
