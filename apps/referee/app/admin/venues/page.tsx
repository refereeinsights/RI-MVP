import Link from "next/link";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminNav from "@/components/admin/AdminNav";
import VenueRow, { VenueItem } from "@/components/admin/VenueRow";
import VenueAddressVerifyPanel from "@/components/admin/VenueAddressVerifyPanel";

type VenueRow = {
  id: string;
  name: string | null;
  address1?: string | null;
  address?: string | null;
  city: string | null;
  state: string | null;
  zip?: string | null;
  sport?: string | null;
  created_at?: string | null;
  map_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  normalized_address?: string | null;
  geocode_source?: string | null;
  timezone?: string | null;
  field_type?: string | null;
  indoor?: boolean | null;
  amenities?: string | null;
  player_parking?: string | null;
  spectator_seating?: string | null;
  bring_field_chairs?: boolean | null;
  seating_notes?: string | null;
  parking_notes?: string | null;
  field_rating?: number | null;
  venue_type?: string | null;
  field_count?: number | null;
  field_monitors?: boolean | null;
  referee_mentors?: boolean | null;
  food_vendors?: boolean | null;
  coffee_vendors?: boolean | null;
  tournament_vendors?: boolean | null;
  referee_tent?: string | null;
  restrooms?: string | null;
  restrooms_cleanliness?: number | null;
  tournament_venues?: Array<{
    tournaments?: Array<{
      id: string;
      name: string | null;
      slug: string | null;
      sport?: string | null;
    }>;
  }>;
};

export const runtime = "nodejs";

type PageProps = {
  searchParams?: {
    q?: string;
    sport?: string;
    state?: string;
    tournament?: string;
  };
};

export default async function AdminVenuesPage({ searchParams }: PageProps) {
  await requireAdmin();

  const q = (searchParams?.q ?? "").trim();
  const sport = (searchParams?.sport ?? "").trim();
  const state = (searchParams?.state ?? "").trim();
  const tournament = (searchParams?.tournament ?? "").trim();

  const orFilters = [];
  if (q) {
    const like = `%${q}%`;
    orFilters.push(
      `name.ilike.${like}`,
      `address.ilike.${like}`,
      `address1.ilike.${like}`,
      `city.ilike.${like}`,
      `state.ilike.${like}`,
      `zip.ilike.${like}`,
      `sport.ilike.${like}`,
      `tournament_venues.tournaments.name.ilike.${like}`
    );
  }
  if (tournament) {
    const like = `%${tournament}%`;
    orFilters.push(`tournament_venues.tournaments.name.ilike.${like}`);
  }

  let query = supabaseAdmin
    .from("venues" as any)
    .select(
      `
        *,
        tournament_venues(
          tournaments(id,name,slug,sport)
        )
      `
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (sport) {
    query = query.eq("sport", sport.toLowerCase());
  }
  if (state) {
    query = query.ilike("state", state);
  }
  if (orFilters.length > 0) {
    query = query.or(orFilters.join(","));
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const venuesRaw: VenueRow[] = Array.isArray(data) ? ((data as unknown) as VenueRow[]) : [];
  const venues: VenueItem[] = venuesRaw.map((v) => {
    const tournamentsList =
      v.tournament_venues
        ?.flatMap((tv) => tv?.tournaments ?? [])
        ?.filter((t): t is NonNullable<typeof t> => Boolean(t)) ?? [];

    const tournaments = Array.from(
      new Map(tournamentsList.map((t) => [t.id, t])).values()
    ) as VenueItem["tournaments"];

    return {
      ...v,
      tournaments,
    };
  });

  if (venues.length > 0) {
    const venueIds = venues.map((v) => v.id);
    // Fetch latest run per venue
    try {
      const { data: runs } = await supabaseAdmin
        .from("owls_eye_runs" as any)
        .select("run_id,venue_id,updated_at,created_at")
        .in("venue_id", venueIds)
        .order("updated_at", { ascending: false });

      const latestRunByVenue: Record<string, string> = {};
      for (const row of runs ?? []) {
        const vid = (row as any)?.venue_id;
        const rid = (row as any)?.run_id;
        if (vid && rid && !latestRunByVenue[vid]) {
          latestRunByVenue[vid] = rid;
        }
      }

      const runIds = Object.values(latestRunByVenue);
      if (runIds.length > 0) {
        const { data: maps } = await supabaseAdmin
          .from("owls_eye_map_artifacts" as any)
          .select("run_id,image_url,created_at")
          .in("run_id", runIds)
          .order("created_at", { ascending: false });

        const mapByRun: Record<string, string> = {};
        for (const row of maps ?? []) {
          const rid = (row as any)?.run_id;
          const url = (row as any)?.image_url;
          if (rid && url && !mapByRun[rid]) {
            mapByRun[rid] = url;
          }
        }

        venues.forEach((v) => {
          const rid = latestRunByVenue[v.id];
          v.map_url = rid ? mapByRun[rid] ?? null : null;
        });
      }
    } catch (err) {
      // If map tables are missing, just leave map_url null
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Venues</h1>
          <p style={{ margin: "4px 0 0", color: "#4b5563" }}>Last 100 venues (filtered)</p>
        </div>
        <Link
          href="/admin/venues/new"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "#111827",
            color: "white",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          New Venue
        </Link>
      </div>

      <form style={{ display: "grid", gap: 8, marginBottom: 16, gridTemplateColumns: "2fr 1fr 1fr 1fr auto" }}>
        <input
          name="q"
          placeholder="Search venue name/address/city/state/UUID"
          defaultValue={q}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
        <input
          name="tournament"
          placeholder="Filter by tournament name"
          defaultValue={tournament}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
        <input
          name="state"
          placeholder="State (e.g., WA)"
          defaultValue={state}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
        <select
          name="sport"
          defaultValue={sport}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
        >
          <option value="">All sports</option>
          <option value="soccer">Soccer</option>
          <option value="basketball">Basketball</option>
          <option value="football">Football</option>
        </select>
        <button type="submit" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
          Search
        </button>
      </form>

      <VenueAddressVerifyPanel />

      <div style={{ display: "grid", gap: 12 }}>
        {venues.length === 0 ? (
          <div style={{ padding: 12, color: "#6b7280", fontSize: 14 }}>No venues found.</div>
        ) : (
          venues.map((v) => <VenueRow key={v.id} venue={v} />)
        )}
      </div>
    </div>
  );
}
