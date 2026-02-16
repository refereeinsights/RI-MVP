import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { geocodeAddress } from "@/lib/google/geocodeAddress";

type VenueRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  created_at?: string | null;
  sport?: string | null;
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

export async function GET(request: Request) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("venues" as any)
    .select("id,name,city,state,sport,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Admin venues fetch failed", error);
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }

  return NextResponse.json({ results: (data ?? []) as VenueRow[] });
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

  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  const address1 = typeof payload?.address1 === "string" ? payload.address1.trim() : "";
  const city = typeof payload?.city === "string" ? payload.city.trim() : "";
  const state = typeof payload?.state === "string" ? payload.state.trim() : "";
  const zip = typeof payload?.zip === "string" ? payload.zip.trim() : "";
  const notes = typeof payload?.notes === "string" ? payload.notes.trim() : null;
  const sport = typeof payload?.sport === "string" ? payload.sport.trim().toLowerCase() : "";
  const venueUrl = typeof payload?.venue_url === "string" ? payload.venue_url.trim() : "";
  const paidParking = payload?.paid_parking === true || payload?.paid_parking === "true";
  const tournamentIds: string[] = Array.isArray(payload?.tournament_ids)
    ? (payload.tournament_ids as any[]).map(String).filter(Boolean)
    : [];

  if (!name || !address1 || !city || !state) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
  }

  const allowedSports = ["soccer", "basketball", "football"];
  const sportValue = allowedSports.includes(sport) ? sport : null;

  let latitude: number | null = null;
  let longitude: number | null = null;
  const geocodeKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (geocodeKey) {
    const fullAddress = [address1, city, state, zip].filter(Boolean).join(", ");
    const geo = await geocodeAddress(fullAddress, geocodeKey);
    if (geo) {
      latitude = geo.lat;
      longitude = geo.lng;
    }
  }

  const insertPayload = {
    name,
    address1,
    city,
    state,
    zip: zip || null,
    notes,
    sport: sportValue,
    latitude,
    longitude,
    venue_url: venueUrl || null,
    paid_parking: paidParking || null,
  };

  const { data, error } = await supabaseAdmin
    .from("venues" as any)
    .insert(insertPayload)
    .select("id,name,city,state,venue_url,paid_parking")
    .single();

  if (error) {
    console.error("Admin venue insert failed", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  if (tournamentIds.length > 0) {
    const toInsert = tournamentIds.map((tid) => ({ tournament_id: tid, venue_id: (data as any)?.id }));
    const { error: linkError } = await supabaseAdmin.from("tournament_venues" as any).insert(toInsert as any[]);
    if (linkError) {
      console.error("Admin venue link insert failed", linkError);
    }
  }

  return NextResponse.json(data as VenueRow);
}
