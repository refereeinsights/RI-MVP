import { createClient } from "@supabase/supabase-js";

type TournamentRow = {
  id: string;
  name: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  venue: string | null;
  address: string | null;
  status: string | null;
  is_canonical: boolean | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sport: string | null;
};

type VenueLinkRow = {
  tournament_id: string | null;
  venue_id: string | null;
};

const APPLY = process.argv.includes("--apply");
const LIMIT = 5000;
const IN_CHUNK = 250;
const BLOCKED_VENUE_IDS = new Set(
  String(process.env.VENUE_LINK_BLOCKLIST_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasText(value: string | null | undefined) {
  return (value ?? "").trim().length > 0;
}

function key(parts: Array<string | null | undefined>) {
  return parts.map((p) => normalize(p)).join("|");
}

function pickFirstNonEmpty(...values: Array<string | null | undefined>) {
  for (const v of values) {
    if (hasText(v)) return String(v).trim();
  }
  return null;
}

function normalizedState(value: string | null | undefined) {
  const v = String(value ?? "").trim().toUpperCase();
  return v || null;
}

function statesConflict(tournamentState: string | null | undefined, venueState: string | null | undefined) {
  const t = normalizedState(tournamentState);
  const v = normalizedState(venueState);
  if (!t || !v) return false;
  return t !== v;
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

  const { data: tournamentsRaw, error: tournamentsErr } = await supabase
    .from("tournaments" as any)
    .select("id,name,sport,city,state,zip,venue,address,status,is_canonical")
    .eq("status", "published")
    .eq("is_canonical", true)
    .limit(LIMIT);
  if (tournamentsErr) throw tournamentsErr;
  const tournaments = (tournamentsRaw ?? []) as TournamentRow[];

  const tournamentIds = tournaments.map((t) => t.id);
  const links: VenueLinkRow[] = [];
  for (let i = 0; i < tournamentIds.length; i += IN_CHUNK) {
    const chunkIds = tournamentIds.slice(i, i + IN_CHUNK);
    if (chunkIds.length === 0) continue;
    const { data: linksRaw, error: linksErr } = await supabase
      .from("tournament_venues" as any)
      .select("tournament_id,venue_id")
      .in("tournament_id", chunkIds);
    if (linksErr) throw linksErr;
    links.push(...((linksRaw ?? []) as VenueLinkRow[]));
  }
  const linkedTournamentIds = new Set(
    links.map((row) => row.tournament_id).filter((v): v is string => typeof v === "string" && v.length > 0)
  );

  const { data: venuesRaw, error: venuesErr } = await supabase
    .from("venues" as any)
    .select("id,name,address,address1,city,state,zip,sport")
    .limit(20000);
  if (venuesErr) throw venuesErr;
  const venues = (venuesRaw ?? []) as VenueRow[];

  const byNameCityState = new Map<string, VenueRow[]>();
  const byAddressCityState = new Map<string, VenueRow[]>();
  const byNameAddressCityState = new Map<string, VenueRow[]>();

  const indexVenue = (venue: VenueRow) => {
    const venueAddress = pickFirstNonEmpty(venue.address1, venue.address);
    if (hasText(venue.name) && hasText(venue.city) && hasText(venue.state)) {
      const k = key([venue.name, venue.city, venue.state]);
      byNameCityState.set(k, [...(byNameCityState.get(k) ?? []), venue]);
    }
    if (hasText(venueAddress) && hasText(venue.city) && hasText(venue.state)) {
      const k = key([venueAddress, venue.city, venue.state]);
      byAddressCityState.set(k, [...(byAddressCityState.get(k) ?? []), venue]);
    }
    if (hasText(venue.name) && hasText(venueAddress) && hasText(venue.city) && hasText(venue.state)) {
      const k = key([venue.name, venueAddress, venue.city, venue.state]);
      byNameAddressCityState.set(k, [...(byNameAddressCityState.get(k) ?? []), venue]);
    }
  };
  venues.forEach(indexVenue);

  const candidates = tournaments.filter((t) => {
    if (linkedTournamentIds.has(t.id)) return false;
    return hasText(t.venue) || hasText(t.address);
  });

  let linkedExisting = 0;
  let createdAndLinked = 0;
  let skippedNoData = 0;
  let skippedStateMismatch = 0;
  let skippedBlockedVenue = 0;
  let errors = 0;

  for (const tournament of candidates) {
    try {
      const venueName = pickFirstNonEmpty(tournament.venue);
      const venueAddress = pickFirstNonEmpty(tournament.address);
      const city = pickFirstNonEmpty(tournament.city);
      const state = pickFirstNonEmpty(tournament.state)?.toUpperCase() ?? null;
      const zip = pickFirstNonEmpty(tournament.zip);
      const sport = pickFirstNonEmpty(tournament.sport);

      if (!venueName && !venueAddress) {
        skippedNoData += 1;
        continue;
      }

      let matched: VenueRow | null = null;
      if (venueName && venueAddress && city && state) {
        const exact = byNameAddressCityState.get(key([venueName, venueAddress, city, state])) ?? [];
        matched = exact[0] ?? null;
      }
      if (!matched && venueAddress && city && state) {
        const byAddress = byAddressCityState.get(key([venueAddress, city, state])) ?? [];
        matched = byAddress[0] ?? null;
      }
      if (!matched && venueName && city && state) {
        const byName = byNameCityState.get(key([venueName, city, state])) ?? [];
        matched = byName[0] ?? null;
      }

      if (matched) {
        if (BLOCKED_VENUE_IDS.has(matched.id)) {
          skippedBlockedVenue += 1;
          continue;
        }
        if (statesConflict(state, matched.state)) {
          skippedStateMismatch += 1;
          continue;
        }
        if (APPLY) {
          const { error: linkErr } = await supabase
            .from("tournament_venues" as any)
            .upsert({ tournament_id: tournament.id, venue_id: matched.id }, { onConflict: "tournament_id,venue_id" });
          if (linkErr) throw linkErr;
        }
        linkedExisting += 1;
        continue;
      }

      const newVenueName = venueName ?? venueAddress ?? `Venue for ${tournament.name ?? "Tournament"}`;
      const newVenueAddress = venueAddress ?? null;
      const insertPayload: Record<string, unknown> = {
        name: newVenueName,
        address1: newVenueAddress,
        address: newVenueAddress,
        city,
        state,
        zip,
        sport: sport ?? null,
      };

      if (!APPLY) {
        createdAndLinked += 1;
        continue;
      }

      const { data: venueInsertRaw, error: venueInsertErr } = await supabase
        .from("venues" as any)
        .insert(insertPayload)
        .select("id,name,address,address1,city,state,zip,sport")
        .single();
      if (venueInsertErr) throw venueInsertErr;
      const newVenue = venueInsertRaw as VenueRow;

      const { error: linkErr } = await supabase
        .from("tournament_venues" as any)
        .upsert({ tournament_id: tournament.id, venue_id: newVenue.id }, { onConflict: "tournament_id,venue_id" });
      if (linkErr) throw linkErr;

      indexVenue(newVenue);
      createdAndLinked += 1;
    } catch (error) {
      errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[link_embedded_tournament_venues] tournament ${tournament.id} failed: ${message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        scanned_published_canonical: tournaments.length,
        already_linked: linkedTournamentIds.size,
        candidates: candidates.length,
        linked_existing: linkedExisting,
        created_and_linked: createdAndLinked,
        skipped_no_data: skippedNoData,
        skipped_state_mismatch: skippedStateMismatch,
        skipped_blocked_venue: skippedBlockedVenue,
        errors,
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
