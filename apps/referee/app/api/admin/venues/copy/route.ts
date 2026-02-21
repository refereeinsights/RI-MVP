import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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

function omitKeys<T extends Record<string, any>>(row: T, keys: string[]) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    if (keys.includes(key)) continue;
    out[key] = value;
  }
  return out;
}

export async function POST(request: Request) {
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

  const sourceVenueId = String(payload?.source_venue_id || "").trim();
  if (!isUuid(sourceVenueId)) {
    return NextResponse.json({ error: "invalid_source_venue_id" }, { status: 400 });
  }

  const sourceVenueResp = await supabaseAdmin
    .from("venues" as any)
    .select("*")
    .eq("id", sourceVenueId)
    .maybeSingle();

  if (sourceVenueResp.error) {
    return NextResponse.json({ error: sourceVenueResp.error.message || "source_fetch_failed" }, { status: 500 });
  }
  if (!sourceVenueResp.data) {
    return NextResponse.json({ error: "source_not_found" }, { status: 404 });
  }

  const sourceVenue = sourceVenueResp.data as Record<string, any>;
  const nowIso = new Date().toISOString();
  const newVenuePayload = {
    ...omitKeys(sourceVenue, ["id", "created_at", "updated_at"]),
    name: payload?.new_name ? String(payload.new_name).trim() : sourceVenue.name,
    created_at: nowIso,
  };

  const insertVenueResp = await supabaseAdmin
    .from("venues" as any)
    .insert(newVenuePayload)
    .select("id,name")
    .single();
  if (insertVenueResp.error) {
    return NextResponse.json({ error: insertVenueResp.error.message || "venue_copy_failed" }, { status: 500 });
  }
  const newVenue = insertVenueResp.data as { id: string; name: string | null };

  // Copy the latest Owl's Eye run for the source venue, then clone map + nearby rows onto the new run.
  let copiedOwlsEye = false;
  let newRunId: string | null = null;
  try {
    let latestRunResp = await supabaseAdmin
      .from("owls_eye_runs" as any)
      .select("id,run_id,venue_id,sport,run_type,status,created_at,updated_at,completed_at")
      .eq("venue_id", sourceVenueId)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRunResp.error && (latestRunResp.error.code === "42703" || latestRunResp.error.code === "PGRST204")) {
      latestRunResp = await supabaseAdmin
        .from("owls_eye_runs" as any)
        .select("id,run_id,venue_id,sport,run_type,status,created_at,completed_at")
        .eq("venue_id", sourceVenueId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    }

    const latestRun = latestRunResp.data as Record<string, any> | null;
    if (latestRun) {
      const sourceRunId = (latestRun.run_id ?? latestRun.id) as string;
      const runId = randomUUID();
      newRunId = runId;

      const runInsertPayload = {
        id: runId,
        run_id: runId,
        venue_id: newVenue.id,
        sport: latestRun.sport ?? "soccer",
        run_type: latestRun.run_type ?? "manual_copy",
        status: latestRun.status ?? "complete",
        created_at: nowIso,
        updated_at: nowIso,
        completed_at: latestRun.completed_at ?? nowIso,
      };

      let runInsertResp = await supabaseAdmin.from("owls_eye_runs" as any).insert(runInsertPayload);
      if (runInsertResp.error && (runInsertResp.error.code === "42703" || runInsertResp.error.code === "PGRST204")) {
        const fallbackRunInsertPayload = {
          id: runId,
          venue_id: newVenue.id,
          sport: latestRun.sport ?? "soccer",
          run_type: latestRun.run_type ?? "manual_copy",
          status: latestRun.status ?? "complete",
          created_at: nowIso,
          completed_at: latestRun.completed_at ?? nowIso,
        };
        runInsertResp = await supabaseAdmin.from("owls_eye_runs" as any).insert(fallbackRunInsertPayload);
      }
      if (runInsertResp.error) {
        throw new Error(runInsertResp.error.message || "owl_run_copy_failed");
      }

      const mapRowsResp = await supabaseAdmin
        .from("owls_eye_map_artifacts" as any)
        .select("*")
        .eq("run_id", sourceRunId);
      const mapRows = ((mapRowsResp.data as Array<Record<string, any>> | null) ?? []).map((row) => ({
        ...omitKeys(row, ["id", "run_id", "created_at"]),
        id: randomUUID(),
        run_id: runId,
        created_at: nowIso,
      }));
      if (mapRows.length > 0) {
        const insertMapsResp = await supabaseAdmin.from("owls_eye_map_artifacts" as any).insert(mapRows);
        if (insertMapsResp.error) {
          throw new Error(insertMapsResp.error.message || "owl_map_copy_failed");
        }
      }

      const nearbyRowsResp = await supabaseAdmin
        .from("owls_eye_nearby_food" as any)
        .select("*")
        .eq("run_id", sourceRunId);
      const nearbyRows = ((nearbyRowsResp.data as Array<Record<string, any>> | null) ?? []).map((row) => ({
        ...omitKeys(row, ["id", "run_id", "created_at"]),
        id: randomUUID(),
        run_id: runId,
        created_at: nowIso,
      }));
      if (nearbyRows.length > 0) {
        const insertNearbyResp = await supabaseAdmin.from("owls_eye_nearby_food" as any).insert(nearbyRows);
        if (insertNearbyResp.error) {
          throw new Error(insertNearbyResp.error.message || "owl_nearby_copy_failed");
        }
      }

      copiedOwlsEye = true;
    }
  } catch (err) {
    // Keep venue copy successful even if Owl's Eye copy fails due schema differences.
    copiedOwlsEye = false;
  }

  return NextResponse.json({
    ok: true,
    source_venue_id: sourceVenueId,
    copied_venue_id: newVenue.id,
    copied_venue_name: newVenue.name,
    copied_owls_eye: copiedOwlsEye,
    copied_owls_eye_run_id: newRunId,
  });
}

