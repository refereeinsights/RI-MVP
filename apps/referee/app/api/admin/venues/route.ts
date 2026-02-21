import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { geocodeAddress } from "@/lib/google/geocodeAddress";
import { timezoneFromCoordinates } from "@/lib/google/timezoneFromCoordinates";

type VenueRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  created_at?: string | null;
  sport?: string | null;
  venue_url?: string | null;
  ref_paid_parking?: boolean | null;
};

const ALLOWED_VENUE_SPORTS = ["soccer", "baseball", "lacrosse", "basketball", "hockey", "volleyball", "futsal"] as const;

function normalizeVenueSport(value: unknown) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ALLOWED_VENUE_SPORTS.includes(text as (typeof ALLOWED_VENUE_SPORTS)[number]) ? text : null;
}

function normalizeRestrooms(value: unknown) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!text) return null;
  if (text === "portable" || text === "portables") return "Portable";
  if (text === "building" || text === "bathroom" || text === "bathrooms") return "Building";
  if (text === "both" || text === "portable and building" || text === "building and portable") return "Both";
  return null;
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
  const sport = normalizeVenueSport(payload?.sport);
  const venueUrl = typeof payload?.venue_url === "string" ? payload.venue_url.trim() : "";
  const amenities = typeof payload?.amenities === "string" ? payload.amenities.trim() : "";
  const playerParking = typeof payload?.player_parking === "string" ? payload.player_parking.trim() : "";
  const spectatorSeatingInput = typeof payload?.spectator_seating === "string" ? payload.spectator_seating.trim().toLowerCase() : "";
  const spectatorSeating =
    spectatorSeatingInput === "none" ||
    spectatorSeatingInput === "limited" ||
    spectatorSeatingInput === "bleachers" ||
    spectatorSeatingInput === "covered_bleachers" ||
    spectatorSeatingInput === "mixed"
      ? spectatorSeatingInput
      : null;
  const bringFieldChairs =
    payload?.bring_field_chairs === true || payload?.bring_field_chairs === "true"
      ? true
      : payload?.bring_field_chairs === false || payload?.bring_field_chairs === "false"
        ? false
        : null;
  const seatingNotes = typeof payload?.seating_notes === "string" ? payload.seating_notes.trim() : "";
  const timezoneInput = typeof payload?.timezone === "string" ? payload.timezone.trim() : "";
  const venueTypeInput = typeof payload?.venue_type === "string" ? payload.venue_type.trim().toLowerCase() : "";
  const venueType =
    venueTypeInput === "complex" || venueTypeInput === "school" || venueTypeInput === "stadium" || venueTypeInput === "park"
      ? venueTypeInput
      : venueTypeInput === "sports complex"
        ? "complex"
        : null;
  const paidParking = payload?.ref_paid_parking === true || payload?.ref_paid_parking === "true";
  const tournamentIds: string[] = Array.isArray(payload?.tournament_ids)
    ? (payload.tournament_ids as any[]).map(String).filter(Boolean)
    : [];

  if (!name || !address1 || !city || !state) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
  }

  const parseNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  let latitude: number | null = parseNumber(payload?.latitude);
  let longitude: number | null = parseNumber(payload?.longitude);
  const geocodeKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (geocodeKey && (latitude == null || longitude == null)) {
    const fullAddress = [address1, city, state, zip].filter(Boolean).join(", ");
    const geo = await geocodeAddress(fullAddress, geocodeKey);
    if (geo) {
      latitude = geo.lat;
      longitude = geo.lng;
    }
  }

  let timezone = timezoneInput || null;
  if (!timezone && geocodeKey && latitude != null && longitude != null) {
    timezone = await timezoneFromCoordinates(latitude, longitude, geocodeKey);
  }

  const insertPayload = {
    name,
    address1,
    city,
    state,
    zip: zip || null,
    notes,
    sport,
    restrooms: normalizeRestrooms(payload?.restrooms),
    latitude,
    longitude,
    venue_url: venueUrl || null,
    timezone,
    venue_type: venueType,
    amenities: amenities || null,
    player_parking: playerParking || null,
    spectator_seating: spectatorSeating,
    bring_field_chairs: bringFieldChairs,
    seating_notes: seatingNotes || null,
    ref_paid_parking: paidParking || null,
  };

  const { data, error } = await supabaseAdmin
    .from("venues" as any)
    .insert(insertPayload)
    .select("id,name,city,state,venue_url,ref_paid_parking")
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
