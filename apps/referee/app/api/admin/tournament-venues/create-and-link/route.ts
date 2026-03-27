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

function cleanText(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
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
  if (!tournamentId) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const name = cleanText(payload?.name);
  const address = cleanText(payload?.address);
  const city = cleanText(payload?.city);
  const state = cleanText(payload?.state)?.toUpperCase() ?? null;
  const zip = cleanText(payload?.zip);

  if (!name && !address) {
    return NextResponse.json({ error: "missing_venue_name_or_address" }, { status: 400 });
  }
  if (!city || !state) {
    return NextResponse.json({ error: "missing_city_or_state" }, { status: 400 });
  }

  const { data: tournamentRow, error: tournamentErr } = await supabaseAdmin
    .from("tournaments" as any)
    .select("sport")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tournamentErr) {
    return NextResponse.json({ error: tournamentErr.message || "tournament_lookup_failed" }, { status: 500 });
  }

  const venuePayload: Record<string, unknown> = {
    name: name ?? address,
    address,
    city,
    state,
    zip,
    sport: (tournamentRow as any)?.sport ?? null,
  };

  const { data: venueRow, error: venueErr } = await supabaseAdmin
    .from("venues" as any)
    .upsert(venuePayload, { onConflict: "name,address,city,state" })
    .select("id,name,city,state")
    .single();
  if (venueErr || !venueRow) {
    return NextResponse.json({ error: venueErr?.message || "venue_upsert_failed" }, { status: 500 });
  }

  const { error: linkErr } = await supabaseAdmin
    .from("tournament_venues" as any)
    .upsert({ tournament_id: tournamentId, venue_id: (venueRow as any).id }, { onConflict: "tournament_id,venue_id" });
  if (linkErr) {
    return NextResponse.json({ error: linkErr.message || "link_failed" }, { status: 500 });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/venues");
  revalidatePath("/admin/tournaments/missing-venues");

  return NextResponse.json({
    ok: true,
    tournament_id: tournamentId,
    venue: { id: (venueRow as any).id, name: (venueRow as any).name ?? null, city: (venueRow as any).city ?? null, state: (venueRow as any).state ?? null },
  });
}

