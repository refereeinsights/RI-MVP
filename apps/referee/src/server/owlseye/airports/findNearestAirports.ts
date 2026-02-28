import { getAdminSupabase } from "../supabase/admin";

export type AirportSummary = {
  id: string;
  ident: string;
  iata_code: string | null;
  name: string;
  municipality: string | null;
  iso_country: string;
  iso_region: string | null;
  airport_type: string;
  scheduled_service: boolean;
  is_commercial: boolean;
  is_major: boolean;
  distance_miles: number;
};

type AirportRow = {
  id: string;
  ident: string;
  iata_code: string | null;
  name: string;
  municipality: string | null;
  iso_country: string;
  iso_region: string | null;
  airport_type: string;
  scheduled_service: boolean;
  is_commercial: boolean;
  is_major: boolean;
  latitude_deg: number;
  longitude_deg: number;
};

type LookupResult = {
  nearest_airport: AirportSummary | null;
  nearest_major_airport: AirportSummary | null;
};

const BOX_STEPS = [1.5, 4, 10, 25, 60];

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.7613;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function toSummary(row: AirportRow, distanceMiles: number): AirportSummary {
  return {
    id: row.id,
    ident: row.ident,
    iata_code: row.iata_code ?? null,
    name: row.name,
    municipality: row.municipality ?? null,
    iso_country: row.iso_country,
    iso_region: row.iso_region ?? null,
    airport_type: row.airport_type,
    scheduled_service: Boolean(row.scheduled_service),
    is_commercial: Boolean(row.is_commercial),
    is_major: Boolean(row.is_major),
    distance_miles: Number(distanceMiles.toFixed(1)),
  };
}

async function fetchCandidates(args: {
  lat: number;
  lng: number;
  majorOnly: boolean;
  boxDegrees: number;
}) {
  const supabase = getAdminSupabase();
  let query = supabase
    .from("airports" as any)
    .select(
      "id,ident,iata_code,name,municipality,iso_country,iso_region,airport_type,scheduled_service,is_commercial,is_major,latitude_deg,longitude_deg"
    )
    .gte("latitude_deg", args.lat - args.boxDegrees)
    .lte("latitude_deg", args.lat + args.boxDegrees)
    .gte("longitude_deg", args.lng - args.boxDegrees)
    .lte("longitude_deg", args.lng + args.boxDegrees)
    .order("latitude_deg", { ascending: true })
    .limit(3000);

  if (args.majorOnly) query = query.eq("is_major", true);
  else query = query.eq("is_commercial", true);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AirportRow[];
}

async function findBest(args: { lat: number; lng: number; majorOnly: boolean }) {
  for (const boxDegrees of BOX_STEPS) {
    const rows = await fetchCandidates({ ...args, boxDegrees });
    if (!rows.length) continue;
    const best = rows
      .map((row) => ({
        row,
        distance: haversineMiles(
          { lat: args.lat, lng: args.lng },
          { lat: row.latitude_deg, lng: row.longitude_deg }
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (best) return toSummary(best.row, best.distance);
  }
  return null;
}

export async function findNearestAirports(args: { lat: number; lng: number }): Promise<LookupResult> {
  const [nearestAirport, nearestMajorAirport] = await Promise.all([
    findBest({ lat: args.lat, lng: args.lng, majorOnly: false }),
    findBest({ lat: args.lat, lng: args.lng, majorOnly: true }),
  ]);

  return {
    nearest_airport: nearestAirport,
    nearest_major_airport: nearestMajorAirport,
  };
}
