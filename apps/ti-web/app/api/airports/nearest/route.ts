import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AirportRow = {
  id: string;
  ident: string;
  name: string;
  municipality: string | null;
  iso_country: string;
  iso_region: string | null;
  iata_code: string | null;
  airport_type: string;
  latitude_deg: number;
  longitude_deg: number;
  scheduled_service: boolean;
  is_commercial: boolean;
  is_major: boolean;
  major_rank: number | null;
};

function toNumber(value: string | null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.7613; // miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = toNumber(url.searchParams.get("lat"));
  const lng = toNumber(url.searchParams.get("lng"));
  const state = String(url.searchParams.get("state") ?? "").trim().toUpperCase();

  if (lat === null || lng === null) {
    return NextResponse.json({ ok: false, error: "missing_lat_lng" }, { status: 400 });
  }

  const isoRegion = state && /^[A-Z]{2}$/.test(state) ? `US-${state}` : null;
  const boxCandidates = [0.5, 1, 2, 4];
  let airports: AirportRow[] = [];

  for (const box of boxCandidates) {
    let q = supabaseAdmin
      .from("airports" as any)
      .select(
        "id,ident,name,municipality,iso_country,iso_region,iata_code,airport_type,latitude_deg,longitude_deg,scheduled_service,is_commercial,is_major,major_rank"
      )
      .eq("iso_country", "US")
      .in("airport_type", ["large_airport", "medium_airport"])
      .gte("latitude_deg", lat - box)
      .lte("latitude_deg", lat + box)
      .gte("longitude_deg", lng - box)
      .lte("longitude_deg", lng + box);

    if (isoRegion) q = q.eq("iso_region", isoRegion);

    const { data, error } = await q.limit(2000);
    if (!error && Array.isArray(data) && data.length) {
      airports = data as any;
      break;
    }
  }

  if (!airports.length) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const scored = airports
    .map((a) => ({
      airport: a,
      distance_miles: haversineMiles(lat, lng, a.latitude_deg, a.longitude_deg),
    }))
    .sort((a, b) => a.distance_miles - b.distance_miles);

  const pickBest = (predicate: (a: AirportRow) => boolean) => scored.find((s) => predicate(s.airport)) ?? null;
  const best =
    pickBest((a) => Boolean(a.is_major)) ??
    pickBest((a) => Boolean(a.is_commercial || a.scheduled_service)) ??
    scored[0] ??
    null;

  if (!best) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const a = best.airport;
  return NextResponse.json({
    ok: true,
    airport: {
      id: a.id,
      name: a.name,
      municipality: a.municipality,
      iso_region: a.iso_region,
      iso_country: a.iso_country,
      iata_code: a.iata_code,
      ident: a.ident,
      latitude_deg: a.latitude_deg,
      longitude_deg: a.longitude_deg,
      is_major: a.is_major,
      is_commercial: a.is_commercial,
      scheduled_service: a.scheduled_service,
      major_rank: a.major_rank,
      distance_miles: Number(best.distance_miles.toFixed(1)),
    },
  });
}

