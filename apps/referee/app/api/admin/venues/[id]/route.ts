import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type VenueUpdatePayload = {
  name?: string | null;
  address1?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  sport?: string | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  normalized_address?: string | null;
  geocode_source?: string | null;
  timezone?: string | null;
  surface?: string | null;
  field_type?: string | null;
  indoor?: boolean | null;
  lighting?: boolean | null;
  parking_notes?: string | null;
  field_rating?: number | null;
  venue_type?: string | null;
  field_count?: number | null;
  field_monitors?: boolean | null;
  referee_mentors?: boolean | null;
  food_vendors?: boolean | null;
  coffee_vendors?: boolean | null;
  tournament_vendors?: boolean | null;
  field_lighting?: boolean | null;
  referee_tent?: string | null;
  restrooms?: string | null;
  restrooms_cleanliness?: number | null;
  tournament_ids?: string[];
  venue_url?: string | null;
  paid_parking?: boolean | null;
};

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

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("venues" as any)
    .select(
      `
        *,
        tournament_venues(
          tournament_id,
          tournaments(name,slug,id,start_date,end_date,sport)
        )
      `
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    console.error("Admin venue fetch failed", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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

  const cleanString = (val: any) => (typeof val === "string" ? val.trim() || null : null);
  const cleanNumber = (val: any) => {
    if (typeof val === "number") return isFinite(val) ? val : null;
    if (typeof val === "string" && val.trim() !== "") {
      const parsed = Number(val);
      return isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  const cleanBool = (val: any) => {
    if (typeof val === "boolean") return val;
    if (val === "true" || val === "1") return true;
    if (val === "false" || val === "0") return false;
    return null;
  };

  const update: VenueUpdatePayload = {
    name: cleanString(payload?.name) ?? undefined,
    address1: cleanString(payload?.address1) ?? undefined,
    address: cleanString(payload?.address) ?? undefined,
    city: cleanString(payload?.city) ?? undefined,
    state: cleanString(payload?.state) ?? undefined,
    zip: cleanString(payload?.zip) ?? undefined,
    sport: cleanString(payload?.sport) ?? undefined,
    notes: cleanString(payload?.notes) ?? undefined,
    latitude: cleanNumber(payload?.latitude) ?? undefined,
    longitude: cleanNumber(payload?.longitude) ?? undefined,
    normalized_address: cleanString(payload?.normalized_address) ?? undefined,
    geocode_source: cleanString(payload?.geocode_source) ?? undefined,
    timezone: cleanString(payload?.timezone) ?? undefined,
    surface: cleanString(payload?.surface) ?? undefined,
    field_type: cleanString(payload?.field_type) ?? undefined,
    indoor: cleanBool(payload?.indoor) ?? undefined,
    lighting: cleanBool(payload?.lighting) ?? undefined,
    parking_notes: cleanString(payload?.parking_notes) ?? undefined,
    field_rating: cleanNumber(payload?.field_rating) ?? undefined,
    venue_type: cleanString(payload?.venue_type) ?? undefined,
    field_count: cleanNumber(payload?.field_count) ?? undefined,
    field_monitors: cleanBool(payload?.field_monitors) ?? undefined,
    referee_mentors: cleanBool(payload?.referee_mentors) ?? undefined,
    food_vendors: cleanBool(payload?.food_vendors) ?? undefined,
    coffee_vendors: cleanBool(payload?.coffee_vendors) ?? undefined,
    tournament_vendors: cleanBool(payload?.tournament_vendors) ?? undefined,
    field_lighting: cleanBool(payload?.field_lighting) ?? undefined,
    referee_tent: cleanString(payload?.referee_tent) ?? undefined,
    restrooms: cleanString(payload?.restrooms) ?? undefined,
    restrooms_cleanliness: cleanNumber(payload?.restrooms_cleanliness) ?? undefined,
    tournament_ids: Array.isArray(payload?.tournament_ids)
      ? (payload.tournament_ids as any[]).map(String).filter(Boolean)
      : undefined,
    venue_url: cleanString(payload?.venue_url) ?? undefined,
    paid_parking: cleanBool(payload?.paid_parking) ?? undefined,
  };

  const { error, data } = await supabaseAdmin
    .from("venues" as any)
    .update(update)
    .eq("id", params.id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Admin venue update failed", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  if (update.tournament_ids) {
    const desired = new Set(update.tournament_ids);
    const { data: existing } = await supabaseAdmin
      .from("tournament_venues" as any)
      .select("tournament_id")
      .eq("venue_id", params.id);

    const current = new Set((existing ?? []).map((r: any) => r.tournament_id));

    const toInsert = [...desired].filter((id) => !current.has(id)).map((id) => ({ tournament_id: id, venue_id: params.id }));
    const toDelete = [...current].filter((id) => !desired.has(id));

    if (toInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin.from("tournament_venues" as any).insert(toInsert as any[]);
      if (insertError) {
        console.error("Admin venue link insert failed", insertError);
      }
    }
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from("tournament_venues" as any)
        .delete()
        .eq("venue_id", params.id)
        .in("tournament_id", toDelete);
      if (deleteError) {
        console.error("Admin venue link delete failed", deleteError);
      }
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabaseAdmin.from("venues" as any).delete().eq("id", params.id);
  if (error) {
    console.error("Admin venue delete failed", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
