import Link from "next/link";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminNav from "@/components/admin/AdminNav";
import PublicMapUrlRow from "@/components/admin/PublicMapUrlRow";
import VenueActions from "@/components/admin/VenueActions";

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
  surface?: string | null;
  field_type?: string | null;
  indoor?: boolean | null;
  lighting?: boolean | null;
  field_lighting?: boolean | null;
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

  const venues: VenueRow[] = Array.isArray(data) ? ((data as unknown) as VenueRow[]) : [];

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

      <div style={{ display: "grid", gap: 12 }}>
        {venues.length === 0 ? (
          <div style={{ padding: 12, color: "#6b7280", fontSize: 14 }}>No venues found.</div>
        ) : (
          venues.map((v, idx) => {
            const tournaments =
              v.tournament_venues
                ?.flatMap((tv) => tv.tournaments ?? [])
                ?.filter(Boolean)
                ?.reduce<Record<string, { id: string; name: string | null; slug: string | null; sport?: string | null }>>(
                  (acc, t) => {
                    if (!t || acc[t.id]) return acc;
                    acc[t.id] = t;
                    return acc;
                  },
                  {}
                ) ?? {};

            return (
              <div
                key={v.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 12,
                  background: idx % 2 === 0 ? "#fcfdff" : "white",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{v.name || "Untitled"}</div>
                    <div style={{ color: "#4b5563", fontSize: 13 }}>
                      {(v.city || "—")}, {(v.state || "—")} · {v.sport || "—"} · {v.zip || "no zip"}
                    </div>
                  </div>
                  <VenueActions venueId={v.id} />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 12, color: "#374151" }}>{v.id}</span>
                  <Link
                    href={`/admin/owls-eye?venueId=${v.id}`}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      background: "#111827",
                      color: "white",
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    Run Owl&apos;s Eye
                  </Link>
                  <PublicMapUrlRow venueId={v.id} compact />
                  {v.map_url ? (
                    <Link
                      href={v.map_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        background: "#e0f2fe",
                        textDecoration: "none",
                        fontSize: 12,
                      }}
                    >
                      View Owl&apos;s Eye Map
                    </Link>
                  ) : (
                    <span style={{ fontSize: 12, color: "#6b7280" }}>No Owl&apos;s Eye map yet</span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
                  <InfoItem label="Address" value={v.address1 || v.address || "—"} />
                  <InfoItem
                    label="Geo"
                    value={
                      v.latitude && v.longitude
                        ? `${v.latitude.toFixed(5)}, ${v.longitude.toFixed(5)}`
                        : "—"
                    }
                  />
                  <InfoItem label="Surface" value={v.surface || "—"} />
                  <InfoItem label="Field type" value={v.field_type || "—"} />
                  <InfoItem label="Indoor" value={boolText(v.indoor)} />
                  <InfoItem label="Lighting" value={boolText(v.lighting ?? v.field_lighting)} />
                  <InfoItem label="Parking" value={v.parking_notes || "—"} />
                  <InfoItem label="Field rating" value={v.field_rating ? `${v.field_rating}/5` : "—"} />
                  <InfoItem label="Venue type" value={v.venue_type || "—"} />
                  <InfoItem label="Field count" value={v.field_count != null ? String(v.field_count) : "—"} />
                  <InfoItem label="Field monitors" value={boolText(v.field_monitors)} />
                  <InfoItem label="Referee mentors" value={boolText(v.referee_mentors)} />
                  <InfoItem label="Food vendors" value={boolText(v.food_vendors)} />
                  <InfoItem label="Coffee vendors" value={boolText(v.coffee_vendors)} />
                  <InfoItem label="Tournament vendors" value={boolText(v.tournament_vendors)} />
                  <InfoItem label="Referee tent" value={v.referee_tent || "—"} />
                  <InfoItem label="Restrooms" value={v.restrooms || "—"} />
                  <InfoItem
                    label="Restroom cleanliness"
                    value={v.restrooms_cleanliness ? `${v.restrooms_cleanliness}/5` : "—"}
                  />
                </div>
                {Object.keys(tournaments).length > 0 ? (
                  <div style={{ fontSize: 13 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Tournaments</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {Object.values(tournaments).map((t) => (
                        <Link
                          key={t.id}
                          href={`/admin?tab=tournament-listings&q=${encodeURIComponent(t.slug || t.name || t.id)}`}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            textDecoration: "none",
                            fontSize: 12,
                            background: "#f8fafc",
                          }}
                        >
                          {t.name || t.slug || t.id} {t.sport ? `· ${t.sport}` : ""}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>No tournaments linked</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function boolText(val: boolean | null | undefined) {
  if (val === true) return "Yes";
  if (val === false) return "No";
  return "—";
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ color: "#4b5563" }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}
