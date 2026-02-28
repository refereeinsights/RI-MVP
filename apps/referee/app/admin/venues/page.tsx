import Link from "next/link";

import { requireAdmin } from "@/lib/admin";
import {
  buildVenueAddressFingerprint,
  buildVenueNameCityStateFingerprint,
  normalizeIdentityStreet,
  normalizeIdentityText,
  normalizeIdentityUrlHost,
} from "@/lib/identity/fingerprints";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminNav from "@/components/admin/AdminNav";
import { VenueItem } from "@/components/admin/VenueRow";
import VenueAddressVerifyPanel from "@/components/admin/VenueAddressVerifyPanel";
import VenuesListClient from "@/components/admin/VenuesListClient";

type VenueRow = {
  id: string;
  name: string | null;
  address1?: string | null;
  address?: string | null;
  venue_url?: string | null;
  city: string | null;
  state: string | null;
  zip?: string | null;
  sport?: string | null;
  created_at?: string | null;
  map_url?: string | null;
  owl_run_id?: string | null;
  owl_status?: string | null;
  owl_last_run_at?: string | null;
  owl_food_count?: number | null;
  owl_coffee_count?: number | null;
  owl_hotel_count?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  normalized_address?: string | null;
  geocode_source?: string | null;
  timezone?: string | null;
  field_type?: string | null;
  indoor?: boolean | null;
  amenities?: string | null;
  player_parking_fee?: string | null;
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

export type DuplicateVenueCandidate = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  linked_tournaments: number;
  owl_run_count: number;
  venue_url: string | null;
  address_fingerprint?: string | null;
  name_city_state_fingerprint?: string | null;
  venue_url_host?: string | null;
};

export type DuplicateVenueGroup = {
  key: string;
  kind: "exact_address_city_state" | "same_name_city_state" | "same_street_state" | "same_name_state";
  suggested_target_id: string;
  candidates: DuplicateVenueCandidate[];
};

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

type PageProps = {
  searchParams?: {
    q?: string;
    sport?: string;
    state?: string;
    tournament?: string;
    missing?: "address_geo" | "urls";
    owl?: "all" | "with_data" | "without_data";
    duplicates?: "1";
  };
};

export default async function AdminVenuesPage({ searchParams }: PageProps) {
  await requireAdmin();

  const q = (searchParams?.q ?? "").trim();
  const sport = (searchParams?.sport ?? "").trim();
  const state = (searchParams?.state ?? "").trim();
  const tournament = (searchParams?.tournament ?? "").trim();
  const missing = (searchParams?.missing ?? "").trim();
  const owlFilter = (searchParams?.owl ?? "all").trim();
  const showDuplicates = searchParams?.duplicates === "1";

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
      `sport.ilike.${like}`
    );
  }
  const tournamentSearch = tournament;
  let venueIdsFromTournamentSearch: string[] = [];
  if (tournamentSearch) {
    const like = `%${tournamentSearch}%`;
    const { data: matchingTournaments } = await supabaseAdmin
      .from("tournaments" as any)
      .select("id")
      .ilike("name", like)
      .limit(200);
    const matchingTournamentIds = (matchingTournaments ?? []).map((row: any) => row.id).filter(Boolean);
    if (matchingTournamentIds.length) {
      const { data: links } = await supabaseAdmin
        .from("tournament_venues" as any)
        .select("venue_id")
        .in("tournament_id", matchingTournamentIds);
      venueIdsFromTournamentSearch = Array.from(
        new Set(((links ?? []) as Array<{ venue_id: string }>).map((row) => row.venue_id).filter(Boolean))
      );
    }
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
  if (missing === "address_geo") {
    query = query.or("address.is.null,address.eq.,address1.is.null,address1.eq.,latitude.is.null,longitude.is.null");
  } else if (missing === "urls") {
    query = query.or("venue_url.is.null,venue_url.eq.");
  }
  if (orFilters.length > 0) {
    query = query.or(orFilters.join(","));
  }
  if (tournamentSearch) {
    if (!venueIdsFromTournamentSearch.length) {
      // Ensure no results when tournament-name filter is requested but no links exist.
      query = query.in("id", ["00000000-0000-0000-0000-000000000000"]);
    } else {
      query = query.in("id", venueIdsFromTournamentSearch);
    }
  }

  const { data, error } = await query;

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <AdminNav />
        <h1 style={{ margin: 0, marginBottom: 10 }}>Venues</h1>
        <div style={{ color: "#b91c1c", fontWeight: 700 }}>Failed to load venues</div>
        <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>{error.message}</div>
      </div>
    );
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
    // Fetch latest run per venue, map artifact, and nearby counts.
    try {
      const runsPrimary = await supabaseAdmin
        .from("owls_eye_runs" as any)
        .select("id,run_id,venue_id,status,updated_at,created_at")
        .in("venue_id", venueIds)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });
      const runsFallback =
        runsPrimary.error && (runsPrimary.error.code === "42703" || runsPrimary.error.code === "PGRST204")
          ? await supabaseAdmin
              .from("owls_eye_runs" as any)
              .select("id,run_id,venue_id,status,created_at")
              .in("venue_id", venueIds)
              .order("created_at", { ascending: false })
          : null;
      const runs = (runsPrimary.error ? runsFallback?.data : runsPrimary.data) ?? [];

      const latestRunByVenue: Record<string, { runId: string; status: string | null; at: string | null }> = {};
      for (const row of runs ?? []) {
        const vid = (row as any)?.venue_id;
        const rid = (row as any)?.run_id ?? (row as any)?.id;
        if (vid && rid && !latestRunByVenue[vid]) {
          latestRunByVenue[vid] = {
            runId: rid,
            status: (row as any)?.status ?? null,
            at: (row as any)?.updated_at ?? (row as any)?.created_at ?? null,
          };
        }
      }

      const runIds = Object.values(latestRunByVenue).map((v) => v.runId);
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

        const { data: nearbyRows } = await supabaseAdmin
          .from("owls_eye_nearby_food" as any)
          .select("run_id,category")
          .in("run_id", runIds);
        const countByRun: Record<string, { food: number; coffee: number; hotel: number }> = {};
        for (const row of nearbyRows ?? []) {
          const runId = (row as any)?.run_id as string | undefined;
          if (!runId) continue;
          const bucket = countByRun[runId] ?? { food: 0, coffee: 0, hotel: 0 };
          const category = ((row as any)?.category ?? "food").toLowerCase();
          if (category === "coffee") bucket.coffee += 1;
          else if (category === "hotel") bucket.hotel += 1;
          else bucket.food += 1;
          countByRun[runId] = bucket;
        }

        venues.forEach((v) => {
          const runMeta = latestRunByVenue[v.id];
          const rid = runMeta?.runId;
          const counts = rid ? countByRun[rid] : undefined;
          v.owl_run_id = rid ?? null;
          v.owl_status = runMeta?.status ?? null;
          v.owl_last_run_at = runMeta?.at ?? null;
          v.map_url = rid ? mapByRun[rid] ?? null : null;
          v.owl_food_count = counts?.food ?? 0;
          v.owl_coffee_count = counts?.coffee ?? 0;
          v.owl_hotel_count = counts?.hotel ?? 0;
        });
      }
    } catch (err) {
      // If map tables are missing, just leave map_url null
    }
  }

  const filteredVenues =
    owlFilter === "with_data"
      ? venues.filter((v) => Boolean(v.owl_run_id))
      : owlFilter === "without_data"
      ? venues.filter((v) => !v.owl_run_id)
      : venues;

  const duplicateGroups: DuplicateVenueGroup[] = [];
  if (showDuplicates) {
    const { data: allVenuesLite } = await supabaseAdmin
      .from("venues" as any)
      .select("id,name,address,address1,normalized_address,city,state,zip,venue_url,address_fingerprint,name_city_state_fingerprint,venue_url_host")
      .limit(3000);
    const { data: allLinks } = await supabaseAdmin.from("tournament_venues" as any).select("venue_id");
    const { data: allRuns } = await supabaseAdmin.from("owls_eye_runs" as any).select("venue_id");
    let duplicateOverrides: Array<{ venue_a_id: string; venue_b_id: string }> = [];
    try {
      const resp = await supabaseAdmin
        .from("venue_duplicate_overrides" as any)
        .select("venue_a_id,venue_b_id,status")
        .eq("status", "keep_both");
      if (!resp.error && Array.isArray(resp.data)) {
        duplicateOverrides = resp.data as Array<{ venue_a_id: string; venue_b_id: string }>;
      }
    } catch {
      duplicateOverrides = [];
    }

    const linkedByVenue = new Map<string, number>();
    for (const row of (allLinks ?? []) as Array<{ venue_id: string | null }>) {
      const venueId = row?.venue_id;
      if (!venueId) continue;
      linkedByVenue.set(venueId, (linkedByVenue.get(venueId) ?? 0) + 1);
    }
    const runsByVenue = new Map<string, number>();
    for (const row of (allRuns ?? []) as Array<{ venue_id: string | null }>) {
      const venueId = row?.venue_id;
      if (!venueId) continue;
      runsByVenue.set(venueId, (runsByVenue.get(venueId) ?? 0) + 1);
    }

    const exactAddressGroups = new Map<string, DuplicateVenueCandidate[]>();
    const nameCityGroups = new Map<string, DuplicateVenueCandidate[]>();
    const streetStateGroups = new Map<string, DuplicateVenueCandidate[]>();
    const nameStateGroups = new Map<string, DuplicateVenueCandidate[]>();

    for (const row of (allVenuesLite ?? []) as Array<Record<string, any>>) {
      const candidate: DuplicateVenueCandidate = {
        id: String(row.id),
        name: row.name ?? null,
        address: row.address1 ?? row.address ?? row.normalized_address ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        zip: row.zip ?? null,
        linked_tournaments: linkedByVenue.get(String(row.id)) ?? 0,
        owl_run_count: runsByVenue.get(String(row.id)) ?? 0,
        venue_url: row.venue_url ?? null,
      };

      const state = normalizeIdentityText(candidate.state);
      const city = normalizeIdentityText(candidate.city);
      const street = normalizeIdentityStreet(candidate.address);
      const name = normalizeIdentityText(candidate.name);

      if (street && state) {
        const key =
          (typeof row.address_fingerprint === "string" && row.address_fingerprint.trim()) ||
          buildVenueAddressFingerprint({
            address: row.address ?? null,
            address1: row.address1 ?? null,
            normalizedAddress: row.normalized_address ?? null,
            city: row.city ?? null,
            state: row.state ?? null,
          });
        if (key) {
          const list = exactAddressGroups.get(key) ?? [];
          list.push(candidate);
          exactAddressGroups.set(key, list);
        }
        const streetStateKey = `${street}|${state}`;
        const streetStateList = streetStateGroups.get(streetStateKey) ?? [];
        streetStateList.push(candidate);
        streetStateGroups.set(streetStateKey, streetStateList);
      }
      if (name && city && state) {
        const key =
          (typeof row.name_city_state_fingerprint === "string" && row.name_city_state_fingerprint.trim()) ||
          buildVenueNameCityStateFingerprint({
            name: row.name ?? null,
            city: row.city ?? null,
            state: row.state ?? null,
          });
        if (key) {
          const list = nameCityGroups.get(key) ?? [];
          list.push(candidate);
          nameCityGroups.set(key, list);
        }
      }
      if (name && state) {
        const key = `${name}|${state}`;
        const list = nameStateGroups.get(key) ?? [];
        list.push(candidate);
        nameStateGroups.set(key, list);
      }
    }

    const seenIds = new Set<string>();
    const keepBothPairs = new Set<string>(
      duplicateOverrides
        .filter((row) => row?.venue_a_id && row?.venue_b_id)
        .map((row) => pairKey(row.venue_a_id, row.venue_b_id))
    );
    const pickTarget = (candidates: DuplicateVenueCandidate[]) =>
      [...candidates].sort((a, b) => {
        if (a.owl_run_count !== b.owl_run_count) return b.owl_run_count - a.owl_run_count;
        if (a.linked_tournaments !== b.linked_tournaments) return b.linked_tournaments - a.linked_tournaments;
        const aHasUrl = a.venue_url ? 1 : 0;
        const bHasUrl = b.venue_url ? 1 : 0;
        if (aHasUrl !== bHasUrl) return bHasUrl - aHasUrl;
        return a.id.localeCompare(b.id);
      })[0];

    for (const [key, list] of exactAddressGroups.entries()) {
      if (list.length < 2) continue;
      const target = pickTarget(list);
      const filtered = list.filter((item) => item.id === target.id || !keepBothPairs.has(pairKey(item.id, target.id)));
      if (filtered.length < 2) continue;
      duplicateGroups.push({
        key,
        kind: "exact_address_city_state",
        suggested_target_id: target.id,
        candidates: filtered,
      });
      filtered.forEach((item) => seenIds.add(item.id));
    }
    for (const [key, list] of nameCityGroups.entries()) {
      if (list.length < 2) continue;
      if (list.some((item) => seenIds.has(item.id))) continue;
      const compatible = list.filter((candidate, _, all) => {
        const candidateStreet = normalizeIdentityStreet(candidate.address);
        const candidateZip = normalizeIdentityText(candidate.zip);
        const candidateHost = candidate.venue_url_host || normalizeIdentityUrlHost(candidate.venue_url);
        return all.some((other) => {
          if (other.id === candidate.id) return false;
          const otherStreet = normalizeIdentityStreet(other.address);
          const otherZip = normalizeIdentityText(other.zip);
          const otherHost = other.venue_url_host || normalizeIdentityUrlHost(other.venue_url);
          if (candidateStreet && otherStreet && candidateStreet === otherStreet) return true;
          if (candidateZip && otherZip && candidateZip === otherZip) return true;
          if (candidateHost && otherHost && candidateHost === otherHost) return true;
          if (!candidateStreet || !otherStreet) return true;
          return false;
        });
      });
      if (compatible.length < 2) continue;
      const target = pickTarget(compatible);
      const filtered = compatible.filter((item) => item.id === target.id || !keepBothPairs.has(pairKey(item.id, target.id)));
      if (filtered.length < 2) continue;
      duplicateGroups.push({
        key,
        kind: "same_name_city_state",
        suggested_target_id: target.id,
        candidates: filtered,
      });
      filtered.forEach((item) => seenIds.add(item.id));
    }
    for (const [key, list] of streetStateGroups.entries()) {
      if (list.length < 2) continue;
      if (list.some((item) => seenIds.has(item.id))) continue;
      const compatible = list.filter((candidate, _, all) => {
        const candidateZip = normalizeIdentityText(candidate.zip);
        const candidateHost = candidate.venue_url_host || normalizeIdentityUrlHost(candidate.venue_url);
        return all.some((other) => {
          if (other.id === candidate.id) return false;
          const otherZip = normalizeIdentityText(other.zip);
          const otherHost = other.venue_url_host || normalizeIdentityUrlHost(other.venue_url);
          return (candidateZip && otherZip && candidateZip === otherZip) || (candidateHost && otherHost && candidateHost === otherHost) || (!candidateZip && !otherZip);
        });
      });
      if (compatible.length < 2) continue;
      const target = pickTarget(compatible);
      const filtered = compatible.filter((item) => item.id === target.id || !keepBothPairs.has(pairKey(item.id, target.id)));
      if (filtered.length < 2) continue;
      duplicateGroups.push({
        key,
        kind: "same_street_state",
        suggested_target_id: target.id,
        candidates: filtered,
      });
      filtered.forEach((item) => seenIds.add(item.id));
    }
    for (const [key, list] of nameStateGroups.entries()) {
      if (list.length < 2) continue;
      if (list.some((item) => seenIds.has(item.id))) continue;
      const compatible = list.filter((candidate, _, all) => {
        const candidateCity = normalizeIdentityText(candidate.city);
        const candidateStreet = normalizeIdentityStreet(candidate.address);
        const candidateHost = candidate.venue_url_host || normalizeIdentityUrlHost(candidate.venue_url);
        return all.some((other) => {
          if (other.id === candidate.id) return false;
          const otherCity = normalizeIdentityText(other.city);
          const otherStreet = normalizeIdentityStreet(other.address);
          const otherHost = other.venue_url_host || normalizeIdentityUrlHost(other.venue_url);
          if (candidateCity && otherCity && candidateCity === otherCity) return true;
          if (candidateStreet && otherStreet && candidateStreet === otherStreet) return true;
          if (candidateHost && otherHost && candidateHost === otherHost) return true;
          return false;
        });
      });
      if (compatible.length < 2) continue;
      const target = pickTarget(compatible);
      const filtered = compatible.filter((item) => item.id === target.id || !keepBothPairs.has(pairKey(item.id, target.id)));
      if (filtered.length < 2) continue;
      duplicateGroups.push({
        key,
        kind: "same_name_state",
        suggested_target_id: target.id,
        candidates: filtered,
      });
    }

    duplicateGroups.sort((a, b) => {
      const kindRank = (kind: DuplicateVenueGroup["kind"]) => {
        if (kind === "exact_address_city_state") return 4;
        if (kind === "same_name_city_state") return 3;
        if (kind === "same_street_state") return 2;
        return 1;
      };
      if (kindRank(a.kind) !== kindRank(b.kind)) return kindRank(b.kind) - kindRank(a.kind);
      const aWeight = a.candidates.reduce((sum, item) => sum + item.linked_tournaments + item.owl_run_count * 2, 0);
      const bWeight = b.candidates.reduce((sum, item) => sum + item.linked_tournaments + item.owl_run_count * 2, 0);
      return bWeight - aWeight;
    });
  }

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Venues</h1>
          <p style={{ margin: "4px 0 0", color: "#4b5563" }}>
            Last 100 venues (filtered) • Owl&apos;s Eye with data: {venues.filter((v) => Boolean(v.owl_run_id)).length}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href="/admin/venues/link-quality"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "#fff",
              color: "#111827",
              fontWeight: 800,
              textDecoration: "none",
              border: "1px solid #d1d5db",
            }}
          >
            Link quality
          </Link>
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
      </div>

      <form style={{ display: "grid", gap: 8, marginBottom: 16, gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto auto" }}>
        {missing ? <input type="hidden" name="missing" value={missing} /> : null}
        {showDuplicates ? <input type="hidden" name="duplicates" value="1" /> : null}
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
          <option value="baseball">Baseball</option>
          <option value="lacrosse">Lacrosse</option>
          <option value="basketball">Basketball</option>
          <option value="hockey">Hockey</option>
          <option value="volleyball">Volleyball</option>
          <option value="futsal">Futsal</option>
        </select>
        <select
          name="owl"
          defaultValue={owlFilter || "all"}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
        >
          <option value="all">All Owl&apos;s Eye states</option>
          <option value="with_data">With Owl&apos;s Eye data</option>
          <option value="without_data">Without Owl&apos;s Eye data</option>
        </select>
        <button type="submit" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
          Search
        </button>
        {!showDuplicates ? (
          <button
            type="submit"
            name="duplicates"
            value="1"
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #1d4ed8", color: "#1d4ed8", fontWeight: 700, background: "#fff" }}
          >
            Check duplicates
          </button>
        ) : (
          <a
            href={`/admin/venues${missing ? `?missing=${encodeURIComponent(missing)}` : ""}`}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #1d4ed8", color: "#1d4ed8", fontWeight: 700, background: "#fff", textDecoration: "none", textAlign: "center" }}
          >
            Hide duplicates
          </a>
        )}
      </form>
      {showDuplicates ? (
        <div style={{ marginBottom: 12, fontSize: 13, color: "#1e3a8a" }}>
          Duplicate check complete: <strong>{duplicateGroups.length}</strong> candidate group{duplicateGroups.length === 1 ? "" : "s"}.
        </div>
      ) : null}
      {missing ? (
        <div style={{ marginBottom: 12, fontSize: 13, color: "#334155" }}>
          Active filter:
          <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 999, background: "#e2e8f0", fontWeight: 700 }}>
            {missing}
          </span>
          <a
            href="/admin/venues"
            style={{ marginLeft: 10, fontSize: 12, color: "#1d4ed8", textDecoration: "none", fontWeight: 700 }}
          >
            Clear
          </a>
        </div>
      ) : null}

      <VenueAddressVerifyPanel />

      <VenuesListClient venues={filteredVenues} duplicateGroups={duplicateGroups} />
    </div>
  );
}
