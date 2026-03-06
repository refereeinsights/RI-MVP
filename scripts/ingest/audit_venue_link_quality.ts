import { createClient } from "@supabase/supabase-js";

type TournamentVenueLink = {
  tournament_id: string | null;
  venue_id: string | null;
};

type TournamentRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
};

type SuspiciousLink = {
  tournament_id: string;
  tournament_name: string | null;
  tournament_city: string | null;
  tournament_state: string | null;
  venue_id: string;
  venue_name: string | null;
  venue_city: string | null;
  venue_state: string | null;
  reason: "state_mismatch" | "high_fanout_multi_state";
};

const APPLY = process.argv.includes("--apply");
const TARGET_VENUE_ID = (process.argv.find((arg) => arg.startsWith("--venue-id=")) ?? "").split("=")[1] ?? "";
const MIN_STATES_ARG = (process.argv.find((arg) => arg.startsWith("--min-venue-states=")) ?? "").split("=")[1] ?? "3";
const MIN_VENUE_STATES = Math.max(2, Number(MIN_STATES_ARG) || 3);
const ONLY_STATE_MISMATCH = process.argv.includes("--only-state-mismatch");

function normState(v: string | null | undefined) {
  const s = String(v ?? "").trim().toUpperCase();
  return s || null;
}

async function fetchAll<T>(fn: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>) {
  const out: T[] = [];
  let from = 0;
  const step = 2000;
  for (;;) {
    const { data, error } = await fn(from, from + step - 1);
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) break;
    out.push(...rows);
    if (rows.length < step) break;
    from += step;
  }
  return out;
}

async function run() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const links = await fetchAll<TournamentVenueLink>((from, to) =>
    (supabase.from("tournament_venues" as any).select("tournament_id,venue_id").range(from, to) as any)
  );
  const filteredLinks = links.filter(
    (l) =>
      l.tournament_id &&
      l.venue_id &&
      (!TARGET_VENUE_ID || String(l.venue_id) === TARGET_VENUE_ID)
  ) as Array<{ tournament_id: string; venue_id: string }>;

  const tournamentIds = Array.from(new Set(filteredLinks.map((l) => l.tournament_id)));
  const venueIds = Array.from(new Set(filteredLinks.map((l) => l.venue_id)));

  const [tournaments, venues] = await Promise.all([
    fetchAll<TournamentRow>((from, to) =>
      (supabase
        .from("tournaments_public" as any)
        .select("id,name,city,state,start_date,end_date")
        .in("id", tournamentIds)
        .range(from, to) as any)
    ),
    fetchAll<VenueRow>((from, to) =>
      (supabase
        .from("venues" as any)
        .select("id,name,city,state")
        .in("id", venueIds)
        .range(from, to) as any)
    ),
  ]);

  const tournamentById = new Map(tournaments.map((t) => [t.id, t]));
  const venueById = new Map(venues.map((v) => [v.id, v]));

  const venueStatesByVenueId = new Map<string, Set<string>>();
  for (const link of filteredLinks) {
    const t = tournamentById.get(link.tournament_id);
    if (!t) continue;
    const state = normState(t.state);
    if (!state) continue;
    const set = venueStatesByVenueId.get(link.venue_id) ?? new Set<string>();
    set.add(state);
    venueStatesByVenueId.set(link.venue_id, set);
  }

  const suspicious: SuspiciousLink[] = [];
  for (const link of filteredLinks) {
    const t = tournamentById.get(link.tournament_id);
    const v = venueById.get(link.venue_id);
    if (!t || !v) continue;

    const tState = normState(t.state);
    const vState = normState(v.state);
    const stateMismatch = Boolean(tState && vState && tState !== vState);
    const fanoutStates = venueStatesByVenueId.get(v.id)?.size ?? 0;
    const highFanout = fanoutStates >= MIN_VENUE_STATES;

    if (!stateMismatch && !highFanout) continue;
    if (ONLY_STATE_MISMATCH && !stateMismatch) continue;

    suspicious.push({
      tournament_id: t.id,
      tournament_name: t.name,
      tournament_city: t.city,
      tournament_state: t.state,
      venue_id: v.id,
      venue_name: v.name,
      venue_city: v.city,
      venue_state: v.state,
      reason: stateMismatch ? "state_mismatch" : "high_fanout_multi_state",
    });
  }

  let deleted = 0;
  if (APPLY) {
    // Safety: only auto-delete direct state mismatches.
    const toDelete = suspicious.filter((s) => s.reason === "state_mismatch");
    for (const row of toDelete) {
      const { error } = await (supabase.from("tournament_venues" as any) as any)
        .delete()
        .eq("tournament_id", row.tournament_id)
        .eq("venue_id", row.venue_id);
      if (error) throw error;
      deleted += 1;
    }
  }

  const byVenue = new Map<string, { venue_name: string | null; venue_state: string | null; links: number; states: number }>();
  for (const [venueId, states] of venueStatesByVenueId.entries()) {
    const venue = venueById.get(venueId);
    byVenue.set(venueId, {
      venue_name: venue?.name ?? null,
      venue_state: venue?.state ?? null,
      links: filteredLinks.filter((l) => l.venue_id === venueId).length,
      states: states.size,
    });
  }
  const topFanout = [...byVenue.entries()]
    .map(([id, v]) => ({ venue_id: id, ...v }))
    .sort((a, b) => b.states - a.states || b.links - a.links)
    .slice(0, 25);

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        target_venue_id: TARGET_VENUE_ID || null,
        min_venue_states: MIN_VENUE_STATES,
        only_state_mismatch: ONLY_STATE_MISMATCH,
        links_scanned: filteredLinks.length,
        suspicious_links: suspicious.length,
        deleted_state_mismatch_links: deleted,
        sample_suspicious_links: suspicious.slice(0, 150),
        top_fanout_venues: topFanout,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

