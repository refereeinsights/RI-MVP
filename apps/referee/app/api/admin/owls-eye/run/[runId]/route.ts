import { NextResponse } from "next/server";

import { getAdminSupabase } from "@/server/owlseye/supabase/admin";
import { upsertNearbyForRun } from "@/owlseye/nearby/upsertNearbyForRun";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Sport = "soccer" | "basketball";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function ensureAdmin(request: Request) {
  const token = process.env.OWLS_EYE_ADMIN_TOKEN;
  const header = request.headers.get("x-owls-eye-admin-token");
  if (header && (!token || header === token)) return true;

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return false;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", data.user.id)
      .maybeSingle();

    return profile?.role === "admin";
  } catch {
    return false;
  }
}

async function fetchRun(runId: string) {
  try {
    const supabase = getAdminSupabase();
    let runResp = await supabase.from("owls_eye_runs").select("*").eq("run_id", runId).maybeSingle();
    if (!runResp.data && !runResp.error) {
      runResp = await supabase.from("owls_eye_runs").select("*").eq("id", runId).maybeSingle();
    }
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

    const resolvedRunId = (run as any).run_id ?? (run as any).id ?? runId;

    const artifactResp = await supabase
      .from("owls_eye_map_artifacts" as any)
      .select("run_id,image_url,north_bearing_degrees,created_at")
      .eq("run_id", resolvedRunId)
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
      .eq("run_id", resolvedRunId)
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
            imageUrl: (artifact as any).image_url ?? null,
            north: (artifact as any).north_bearing_degrees ?? undefined,
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
        hotels: nearbyItems
          .filter((f) => f.category === "hotel")
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
  try {
    if (!(await ensureAdmin(request))) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const forceNearby = searchParams.get("force") === "true" || searchParams.get("forceNearby") === "true";
    const runId = context.params.runId;
    if (!runId || !isUuid(runId)) {
      return NextResponse.json({ error: "invalid_run_id" }, { status: 400 });
    }

  if (forceNearby) {
    try {
      const supabase = getAdminSupabase();
      let runResp = await supabase.from("owls_eye_runs" as any).select("venue_id,run_id,id,sport").eq("run_id", runId).maybeSingle();
      if (!runResp.data && !runResp.error) {
        runResp = await supabase.from("owls_eye_runs" as any).select("venue_id,id,sport").eq("id", runId).maybeSingle();
      }
      const venueId = runResp.data?.venue_id;
      const runSport = (runResp.data as any)?.sport as Sport | undefined;
      if (venueId) {
        const venueResp = await supabase
          .from("venues" as any)
          .select("latitude,longitude,lat,lng")
          .eq("id", venueId)
            .maybeSingle();
          const lat =
            (venueResp.data as any)?.latitude ??
            (venueResp.data as any)?.lat ??
            null;
          const lng =
            (venueResp.data as any)?.longitude ??
            (venueResp.data as any)?.lng ??
            null;
        if (typeof lat === "number" && typeof lng === "number" && isFinite(lat) && isFinite(lng)) {
          await upsertNearbyForRun({
            supabaseAdmin: supabase,
            runId: (runResp.data as any)?.run_id ?? (runResp.data as any)?.id ?? runId,
            venueId,
            sport: runSport,
            venueLat: lat,
            venueLng: lng,
            force: true,
          });
        }
        }
      } catch (err) {
        console.error("[owlseye] force nearby failed", err);
      }
    }

    const payload = await fetchRun(runId);
    if ("message" in payload && payload.status === "unknown") {
      return NextResponse.json({ runId, status: "unknown", message: payload.message });
    }

    return NextResponse.json({ runId, ...payload });
  } catch (err) {
    console.error("[owlseye] run GET failed", err);
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
