import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(
  request: Request,
  context: { params: { venueId: string } }
) {
  const venueId = context.params.venueId;
  if (!venueId || !isUuid(venueId)) {
    return NextResponse.json({ error: "invalid_venue_id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const categoriesParam = searchParams.get("categories") ?? "quick_eats,hangouts";
  const categories = categoriesParam
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  if (categories.length === 0) {
    return NextResponse.json({ venueId, runId: null, categories: [], places: [] });
  }

  const { data: run } = await supabaseAdmin
    .from("owls_eye_runs" as any)
    .select("id,run_id,venue_id,status,created_at")
    .eq("venue_id", venueId)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const resolvedRunId = (run as any)?.run_id ?? (run as any)?.id ?? null;
  if (!resolvedRunId) {
    return NextResponse.json({ venueId, runId: null, categories, places: [] });
  }

  const { data: rows } = await supabaseAdmin
    .from("owls_eye_nearby_food" as any)
    .select(
      "run_id,provider,provider_place_id,place_id,name,category,distance_meters,maps_url,search_radius_meters,fallback_used,fallback_reason,reason_tags,place_latitude,place_longitude"
    )
    .eq("run_id", resolvedRunId)
    .in("category", categories)
    .order("distance_meters", { ascending: true })
    .order("name", { ascending: true });

  return NextResponse.json({
    venueId,
    runId: resolvedRunId,
    categories,
    places: rows ?? [],
  });
}

