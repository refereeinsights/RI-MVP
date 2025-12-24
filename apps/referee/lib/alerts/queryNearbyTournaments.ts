import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type NearbyTournament = {
  id: string;
  name: string | null;
  slug: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_state: string | null;
  latitude: number | null;
  longitude: number | null;
};

type TournamentRow = {
  id: string;
  name: string | null;
  slug: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  tournament_venues: {
    venue_id: string | null;
    venues: {
      name: string | null;
      city: string | null;
      state: string | null;
      latitude: number | null;
      longitude: number | null;
    } | null;
  }[];
};

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8; // miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function queryNearbyTournaments(params: {
  latitude: number;
  longitude: number;
  radius_miles: number;
  last_sent_at: string | null;
}): Promise<NearbyTournament[]> {
  const now = new Date();
  const horizon = new Date();
  horizon.setDate(now.getDate() + 90);

  const createdSince = params.last_sent_at
    ? new Date(params.last_sent_at)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const { data, error } = await supabaseAdmin
    .from("tournaments" as any)
    .select(
      `
      id,
      name,
      slug,
      city,
      state,
      start_date,
      end_date,
      created_at,
      tournament_venues (
        venue_id,
        venues (
          name,
          city,
          state,
          latitude,
          longitude
        )
      )
    `
    )
    .eq("status", "published")
    .gte("start_date", now.toISOString().slice(0, 10))
    .lte("start_date", horizon.toISOString().slice(0, 10))
    .gt("created_at", createdSince.toISOString());

  if (error) throw error;

  const rows = Array.isArray(data) ? (data as unknown as TournamentRow[]) : [];
  const results: NearbyTournament[] = [];

  for (const row of rows) {
    for (const link of row.tournament_venues ?? []) {
      const venue = link.venues;
      if (!venue || venue.latitude == null || venue.longitude == null) continue;
      const distance = haversineMiles(
        params.latitude,
        params.longitude,
        venue.latitude,
        venue.longitude
      );
      if (distance <= params.radius_miles) {
        results.push({
          id: row.id,
          name: row.name,
          slug: row.slug,
          city: row.city,
          state: row.state,
          start_date: row.start_date,
          end_date: row.end_date,
          venue_name: venue.name ?? null,
          venue_city: venue.city ?? null,
          venue_state: venue.state ?? null,
          latitude: venue.latitude,
          longitude: venue.longitude,
        });
        break; // one venue match is enough to include
      }
    }
  }

  results.sort((a, b) => {
    const aDate = a.start_date ?? "";
    const bDate = b.start_date ?? "";
    if (aDate < bDate) return -1;
    if (aDate > bDate) return 1;
    return 0;
  });

  return results;
}
