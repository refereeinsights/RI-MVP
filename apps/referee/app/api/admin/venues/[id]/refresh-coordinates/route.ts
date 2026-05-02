import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { geocodeAddressMapbox } from "@/lib/mapbox/geocodeAddress";
import { timezoneFromCoordinates } from "@/lib/google/timezoneFromCoordinates";

async function ensureAdminRequest() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("user_id", data.user.id).maybeSingle();
  if (!profile || profile.role !== "admin") return null;
  return data.user;
}

function cleanString(val: any) {
  return typeof val === "string" ? val.trim() || null : null;
}

// Falls back to venue name as a POI query when no street address is present.
function buildGeocodeQuery(parts: { name?: string | null; address1?: string | null; city?: string | null; state?: string | null; zip?: string | null }) {
  const base = cleanString(parts.address1) ?? cleanString(parts.name);
  if (!base) return null;
  const bits = [base, parts.city, parts.state, parts.zip].map((v) => cleanString(v)).filter(Boolean);
  return bits.length ? bits.join(", ") : null;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mapboxToken = (process.env.MAPBOX_ACCESS_TOKEN ?? "").trim();
  const geocodeKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
  if (!mapboxToken) return NextResponse.json({ error: "missing_mapbox_token" }, { status: 400 });

  let body: any = null;
  try {
    body = await request.json().catch(() => null);
  } catch {
    body = null;
  }

  // Prefer the address the admin currently has typed in (client passes it), else fall back to DB.
  let address1 = cleanString(body?.address1 ?? null);
  let city = cleanString(body?.city ?? null);
  let state = cleanString(body?.state ?? null);
  let zip = cleanString(body?.zip ?? null);

  let venueName: string | null = null;
  if (!address1 || !city || !state) {
    const { data: venue, error } = await supabaseAdmin
      .from("venues" as any)
      .select("id,name,address1,address,city,state,zip")
      .eq("id", params.id)
      .maybeSingle();
    if (error || !venue) return NextResponse.json({ error: "not_found" }, { status: 404 });

    venueName = cleanString((venue as any).name ?? null);
    address1 = address1 ?? cleanString((venue as any).address1 ?? (venue as any).address ?? null);
    city = city ?? cleanString((venue as any).city ?? null);
    state = state ?? cleanString((venue as any).state ?? null);
    zip = zip ?? cleanString((venue as any).zip ?? null);
  }

  const geocodeQuery = buildGeocodeQuery({ name: venueName, address1, city, state, zip });
  if (!geocodeQuery) return NextResponse.json({ error: "missing_address" }, { status: 400 });

  const geo = await geocodeAddressMapbox(geocodeQuery, mapboxToken, { expectedState: state });
  if (!geo) return NextResponse.json({ error: "geocode_failed" }, { status: 400 });

  const timezone = geocodeKey ? await timezoneFromCoordinates(geo.lat, geo.lng, geocodeKey) : null;

  return NextResponse.json({
    venue_id: params.id,
    input_address: geocodeQuery,
    latitude: geo.lat,
    longitude: geo.lng,
    normalized_address: geo.formatted_address ?? null,
    city: geo.city ?? null,
    state: geo.state ?? null,
    zip: geo.zip ?? null,
    timezone,
    geocode_source: "mapbox",
  });
}

