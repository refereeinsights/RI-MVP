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
  const venueIdsRaw = Array.isArray(payload?.venue_ids) ? payload.venue_ids : [];
  const venueIds = venueIdsRaw.map(cleanUuid).filter(Boolean) as string[];
  const dedupedVenueIds = Array.from(new Set(venueIds));

  if (!tournamentId || dedupedVenueIds.length === 0) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (dedupedVenueIds.length > 250) {
    return NextResponse.json({ error: "too_many_venue_ids" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("tournament_venues" as any)
    .delete()
    .eq("tournament_id", tournamentId)
    .in("venue_id", dedupedVenueIds);
  if (error) {
    return NextResponse.json({ error: error.message || "unlink_failed" }, { status: 500 });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/venues");
  revalidatePath("/admin/tournaments/missing-venues");

  return NextResponse.json({ ok: true, tournament_id: tournamentId, venue_ids: dedupedVenueIds });
}

