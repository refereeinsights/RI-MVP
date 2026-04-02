import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const tournamentId = typeof body?.tournament_id === "string" ? body.tournament_id : null;
  const venueId = typeof body?.venue_id === "string" ? body.venue_id : null;
  const method = typeof body?.method === "string" ? body.method : null;
  const notes = typeof body?.notes === "string" ? body.notes : null;
  const removeLink = typeof body?.remove_link === "boolean" ? body.remove_link : true;

  if (!tournamentId || !venueId || !method) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("reject_inferred_venue" as any, {
    p_tournament_id: tournamentId,
    p_venue_id: venueId,
    p_method: method,
    p_notes: notes,
    p_remove_link: removeLink,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rejected: Boolean(data) });
}

