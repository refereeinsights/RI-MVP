import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function cleanUuid(value: unknown): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return null;
  return v;
}

async function requireAdminApi(): Promise<{ user_id: string } | null> {
  const supa = createSupabaseServerClient();
  const { data: userData, error: userErr } = await supa.auth.getUser();
  if (userErr || !userData.user) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("user_id, role")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") return null;
  return { user_id: String((profile as any).user_id ?? userData.user.id) };
}

export async function POST(request: Request) {
  const admin = await requireAdminApi();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const tournamentId = cleanUuid(payload?.tournament_id);
  const skip = Boolean(payload?.skip);
  if (!tournamentId) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("tournaments")
    .update({ skip_venue_discovery: skip, updated_at: new Date().toISOString() })
    .eq("id", tournamentId);
  if (error) {
    return NextResponse.json({ error: error.message || "update_failed" }, { status: 500 });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/venues");
  revalidatePath("/admin/tournaments/missing-venues");
  revalidatePath("/admin/tournaments/dashboard");

  return NextResponse.json({ ok: true, tournament_id: tournamentId, skip });
}

