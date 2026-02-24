import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

  const venueIds = Array.from(new Set((payload?.venue_ids ?? []).map((id: any) => String(id).trim()).filter(Boolean)));
  const confirmOwlDelete = Boolean(payload?.confirm_owl_delete);
  if (venueIds.length === 0) {
    return NextResponse.json({ error: "venue_ids_required" }, { status: 400 });
  }
  if (venueIds.length > 500) {
    return NextResponse.json({ error: "too_many_venue_ids" }, { status: 400 });
  }

  try {
    const { data: runRows, error: runsErr } = await supabaseAdmin
      .from("owls_eye_runs" as any)
      .select("id,run_id,venue_id")
      .in("venue_id", venueIds);
    if (runsErr && runsErr.code !== "PGRST204") throw runsErr;

    const runIds = Array.from(
      new Set(
        ((runRows ?? []) as Array<{ id?: string | null; run_id?: string | null }>)
          .flatMap((row) => [row.run_id, row.id])
          .filter((value): value is string => typeof value === "string" && value.length > 0)
      )
    );

    if (runIds.length > 0 && !confirmOwlDelete) {
      return NextResponse.json(
        { error: "owl_data_confirm_required", message: "One or more selected venues have Owl's Eye data; explicit confirmation required." },
        { status: 409 }
      );
    }

    if (runIds.length > 0) {
      await supabaseAdmin.from("owls_eye_nearby_food" as any).delete().in("run_id", runIds);
      await supabaseAdmin.from("owls_eye_map_artifacts" as any).delete().in("run_id", runIds);
      await supabaseAdmin.from("owls_eye_runs" as any).delete().in("venue_id", venueIds);
    }

    await supabaseAdmin.from("tournament_venues" as any).delete().in("venue_id", venueIds);
    await supabaseAdmin.from("venues" as any).delete().in("id", venueIds);

    return NextResponse.json({ ok: true, deleted_venue_count: venueIds.length });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "bulk_delete_failed" }, { status: 500 });
  }
}
