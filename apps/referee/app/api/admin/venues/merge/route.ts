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
  const targetVenueId = String(payload?.target_venue_id || "").trim();
  const removeSource = payload?.remove_source !== false;

  if (!isUuid(sourceVenueId) || !isUuid(targetVenueId)) {
    return NextResponse.json({ error: "invalid_venue_id" }, { status: 400 });
  }
  if (sourceVenueId === targetVenueId) {
    return NextResponse.json({ error: "source_and_target_same" }, { status: 400 });
  }

  const [{ data: sourceVenue }, { data: targetVenue }] = await Promise.all([
    supabaseAdmin.from("venues" as any).select("id,name").eq("id", sourceVenueId).maybeSingle(),
    supabaseAdmin.from("venues" as any).select("id,name").eq("id", targetVenueId).maybeSingle(),
  ]);

  if (!sourceVenue) return NextResponse.json({ error: "source_not_found" }, { status: 404 });
  if (!targetVenue) return NextResponse.json({ error: "target_not_found" }, { status: 404 });

  const { data: sourceLinks, error: linksError } = await supabaseAdmin
    .from("tournament_venues" as any)
    .select("tournament_id")
    .eq("venue_id", sourceVenueId);
  if (linksError) {
    return NextResponse.json({ error: linksError.message || "source_links_failed" }, { status: 500 });
  }

  const tournamentIds = Array.from(
    new Set(((sourceLinks as Array<{ tournament_id: string }> | null) ?? []).map((row) => row.tournament_id).filter(Boolean))
  );

  if (tournamentIds.length > 0) {
    const upsertRows = tournamentIds.map((tournamentId) => ({ tournament_id: tournamentId, venue_id: targetVenueId }));
    const { error: upsertError } = await supabaseAdmin
      .from("tournament_venues" as any)
      .upsert(upsertRows as any[], { onConflict: "tournament_id,venue_id" });
    if (upsertError) {
      return NextResponse.json({ error: upsertError.message || "target_link_upsert_failed" }, { status: 500 });
    }
  }

  // Keep Owl's Eye history attached to the kept venue where possible.
  try {
    await supabaseAdmin.from("owls_eye_runs" as any).update({ venue_id: targetVenueId }).eq("venue_id", sourceVenueId);
  } catch {
    // Ignore if table/column doesn't exist in this environment.
  }

  if (removeSource) {
    const { error: deleteError } = await supabaseAdmin.from("venues" as any).delete().eq("id", sourceVenueId);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message || "source_delete_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    source_venue_id: sourceVenueId,
    target_venue_id: targetVenueId,
    moved_tournament_links: tournamentIds.length,
    source_removed: removeSource,
  });
}
