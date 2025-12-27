import { NextResponse } from "next/server";

import { getAdminSupabase } from "@/server/owlseye/supabase/admin";

type Sport = "soccer" | "basketball";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function authorizedAdmin(request: Request) {
  const token = process.env.OWLS_EYE_ADMIN_TOKEN;
  if (!token) return false;
  const header = request.headers.get("x-owls-eye-admin-token");
  return Boolean(header && header === token);
}

async function fetchRun(runId: string) {
  try {
    const supabase = getAdminSupabase();
    const runResp = await supabase.from("owls_eye_runs").select("*").eq("run_id", runId).maybeSingle();
    if (runResp.error) {
      if (runResp.error.code === "42P01" || runResp.error.code === "42703") {
        return { status: "unknown", message: "Run table not found yet" };
      }
      throw runResp.error;
    }
    const run = runResp.data;
    if (!run) {
      return { status: "unknown", message: "Run not found" };
    }

    const artifactResp = await supabase
      .from("owls_eye_map_artifacts")
      .select("*")
      .eq("venue_id", run.venue_id)
      .eq("sport", run.sport as Sport)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let artifact: any = null;
    if (artifactResp?.data) {
      artifact = artifactResp.data;
    } else if (artifactResp?.error && artifactResp.error.code !== "42P01" && artifactResp.error.code !== "42703") {
      throw artifactResp.error;
    }

    const foodResp = await supabase
      .from("owls_eye_nearby_food" as any)
      .select("*")
      .eq("run_id", runId)
      .order("is_sponsor", { ascending: false })
      .order("distance_meters", { ascending: true })
      .order("name", { ascending: true });

    let nearbyItems: any[] = [];
    if (foodResp.data) {
      nearbyItems = foodResp.data;
    } else if (foodResp.error && foodResp.error.code !== "42P01" && foodResp.error.code !== "42703") {
      throw foodResp.error;
    }

    return {
      status: run.status ?? "unknown",
      run,
      map: artifact
        ? {
            imageUrl: artifact.url,
            north: artifact.north ?? undefined,
            legend: [],
          }
        : undefined,
      nearby: {
        food: nearbyItems
          .filter((f) => (f.category ?? "food") === "food")
          .map((f) => ({
            name: f.name,
            distance_meters: f.distance_meters ?? null,
            address: f.address ?? "",
            is_sponsor: Boolean(f.is_sponsor),
            sponsor_click_url: f.sponsor_click_url ?? undefined,
            maps_url: f.maps_url ?? undefined,
          })),
        coffee: nearbyItems
          .filter((f) => f.category === "coffee")
          .map((f) => ({
            name: f.name,
            distance_meters: f.distance_meters ?? null,
            address: f.address ?? "",
            is_sponsor: Boolean(f.is_sponsor),
            sponsor_click_url: f.sponsor_click_url ?? undefined,
            maps_url: f.maps_url ?? undefined,
          })),
      },
      annotations: [],
    };
  } catch (err) {
    return { status: "unknown", message: err instanceof Error ? err.message : "lookup_failed" };
  }
}

export async function GET(request: Request, context: { params: { runId: string } }) {
  if (!authorizedAdmin(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const runId = context.params.runId;
  if (!runId || !isUuid(runId)) {
    return NextResponse.json({ error: "invalid_run_id" }, { status: 400 });
  }

  const payload = await fetchRun(runId);
  if ("message" in payload && payload.status === "unknown") {
    return NextResponse.json({ runId, status: "unknown", message: payload.message });
  }

  return NextResponse.json({ runId, ...payload });
}
