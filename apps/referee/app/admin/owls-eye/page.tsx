import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import OwlsEyePanel from "./OwlsEyePanel";

export const runtime = "nodejs";

type ReadyVenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  address1?: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
};

export default async function OwlsEyeAdminPage({ searchParams }: { searchParams?: { venueId?: string } }) {
  await requireAdmin();
  const adminToken = process.env.NEXT_PUBLIC_OWLS_EYE_ADMIN_TOKEN ?? process.env.OWLS_EYE_ADMIN_TOKEN ?? "";
  const venueId = searchParams?.venueId ?? "";
  const { data: readyVenuesRaw } = await supabaseAdmin
    .from("venues" as any)
    .select("id,name,address,address1,city,state,zip,latitude,longitude")
    .not("city", "is", null)
    .not("state", "is", null)
    .or("address.not.is.null,address1.not.is.null")
    .not("name", "is", null)
    .order("state", { ascending: true })
    .order("city", { ascending: true })
    .order("name", { ascending: true })
    .limit(6000);

  const allVenues = (readyVenuesRaw ?? []) as ReadyVenueRow[];

  const pickStreetAddress = (venue: { address?: string | null; address1?: string | null }) => {
    const address = String(venue.address ?? "").trim();
    const address1 = String(venue.address1 ?? "").trim();

    // Prefer `address` over `address1` when both exist (address1 is often stale after cleanup edits).
    if (address) return address;
    return address1;
  };

  const readyCandidates = allVenues.filter((venue) => {
    const street = pickStreetAddress(venue);
    const hasAddress =
      Boolean(street.trim()) &&
      Boolean((venue.city ?? "").trim()) &&
      Boolean((venue.state ?? "").trim());
    return hasAddress;
  });
  const chunkValues = <T,>(values: T[], size = 120) => {
    const chunks: T[][] = [];
    for (let i = 0; i < values.length; i += size) {
      chunks.push(values.slice(i, i + size));
    }
    return chunks;
  };

  const venueIds = readyCandidates.map((v) => v.id).filter(Boolean);
  let runVenueIds = new Set<string>();
  const tournamentNamesByVenue = new Map<string, string[]>();
  const tournamentSportsByVenue = new Map<string, string[]>();
  const linkedTournamentCountByVenue = new Map<string, number>();
  const tournamentIdsByVenue = new Map<string, Set<string>>();
  const tournamentNameById = new Map<string, string>();
  let tournamentNameLookupError: string | null = null;
  if (venueIds.length) {
    const runRows: Array<{ venue_id: string | null }> = [];
    for (const idChunk of chunkValues(venueIds)) {
      const { data: runs } = await supabaseAdmin
        .from("owls_eye_runs" as any)
        .select("venue_id")
        .in("venue_id", idChunk);
      runRows.push(...((runs ?? []) as Array<{ venue_id: string | null }>));
    }
    runVenueIds = new Set(runRows.map((row) => row.venue_id || "").filter(Boolean));

    const notRunVenueIds = venueIds.filter((id) => id && !runVenueIds.has(id));
    const linkRows: Array<{ venue_id: string | null; tournament_id: string | null }> = [];
    for (const idChunk of chunkValues(notRunVenueIds)) {
      const { data: venueLinks } = await supabaseAdmin
        .from("tournament_venues" as any)
        .select("venue_id,tournament_id")
        .in("venue_id", idChunk);
      linkRows.push(...((venueLinks ?? []) as Array<{ venue_id: string | null; tournament_id: string | null }>));
    }
    linkRows.forEach((row) => {
      if (!row.venue_id || !row.tournament_id) return;
      linkedTournamentCountByVenue.set(row.venue_id, (linkedTournamentCountByVenue.get(row.venue_id) ?? 0) + 1);
      const existing = tournamentIdsByVenue.get(row.venue_id) ?? new Set<string>();
      existing.add(row.tournament_id);
      tournamentIdsByVenue.set(row.venue_id, existing);
    });
    const tournamentIds = Array.from(
      new Set(linkRows.map((row) => row.tournament_id).filter((value): value is string => Boolean(value)))
    );
    const tournamentSportById = new Map<string, string>();
    if (tournamentIds.length) {
      for (const idChunk of chunkValues(tournamentIds)) {
        const { data: tournaments, error } = await supabaseAdmin
          .from("tournaments" as any)
          .select("id,name,sport")
          .in("id", idChunk);
        if (error) {
          tournamentNameLookupError = error.message;
          continue;
        }
        ((tournaments ?? []) as Array<{ id: string | null; name: string | null; sport?: string | null }>).forEach((row) => {
          if (!row.id || !row.name) return;
          tournamentNameById.set(row.id, row.name);
          const sport = typeof row.sport === "string" ? row.sport.trim() : "";
          if (sport) tournamentSportById.set(row.id, sport);
        });
      }
    }
    // Build per-venue sport lists for sorting. Tournament names are populated only for displayed ready rows below.
    tournamentIdsByVenue.forEach((tournamentIdsForVenue, venueId) => {
      const sports: string[] = [];
      tournamentIdsForVenue.forEach((tournamentId) => {
        const sport = tournamentSportById.get(tournamentId);
        if (sport && !sports.includes(sport)) sports.push(sport);
      });
      if (sports.length) tournamentSportsByVenue.set(venueId, sports);
    });
  }
  const nameJunkRegex = /\b(born\s*\d{4}|\d{1,2}u\b|girls?\d{1,2}u|boys?\d{1,2}u|program|coach:|size\s*\d+)\b/i;
  const notRunCandidates = readyCandidates.filter((venue) => !runVenueIds.has(venue.id));
  const noLinkedTournamentCandidates = notRunCandidates.filter((venue) => {
    return (linkedTournamentCountByVenue.get(venue.id) ?? 0) === 0;
  });
  const junkNameCandidates = notRunCandidates.filter((venue) => {
    const linkedCount = linkedTournamentCountByVenue.get(venue.id) ?? 0;
    if (linkedCount === 0) return false;
    const normalizedName = String(venue.name ?? "").trim().toLowerCase();
    if (!normalizedName) return true;
    return nameJunkRegex.test(normalizedName);
  });

  const normalize = (value?: string | null) => (value || "").toLowerCase().replace(/\s+/g, " ").trim();
  const duplicateBucketKey = (venue: { name?: string | null; address1?: string | null; address?: string | null; city?: string | null; state?: string | null }) => {
    const address = normalize(pickStreetAddress(venue));
    const city = normalize(venue.city);
    const state = normalize(venue.state);
    const name = normalize(venue.name);
    // Prefer address+city+state; fall back to name grouping when address missing.
    return [address || name, city, state].join("|");
  };

  const readyNotRunAll = notRunCandidates
    .filter((venue) => {
      return (linkedTournamentCountByVenue.get(venue.id) ?? 0) > 0;
    })
    .filter((venue) => {
      const normalizedName = String(venue.name ?? "").trim().toLowerCase();
      if (!normalizedName) return false;
      return !nameJunkRegex.test(normalizedName);
    })
    .sort((a, b) => {
      const aBucket = duplicateBucketKey(a);
      const bBucket = duplicateBucketKey(b);
      if (aBucket !== bBucket) return aBucket.localeCompare(bBucket);

      const aCount = linkedTournamentCountByVenue.get(a.id) ?? 0;
      const bCount = linkedTournamentCountByVenue.get(b.id) ?? 0;
      if (aCount !== bCount) return bCount - aCount;

      const aPrimarySport = (tournamentSportsByVenue.get(a.id) ?? []).slice().sort((x, y) => x.localeCompare(y))[0] ?? "";
      const bPrimarySport = (tournamentSportsByVenue.get(b.id) ?? []).slice().sort((x, y) => x.localeCompare(y))[0] ?? "";
      if (aPrimarySport !== bPrimarySport) return aPrimarySport.localeCompare(bPrimarySport);

      const aAddress = normalize(pickStreetAddress(a));
      const bAddress = normalize(pickStreetAddress(b));
      if (aAddress !== bAddress) return aAddress.localeCompare(bAddress);

      const aCity = normalize(a.city);
      const bCity = normalize(b.city);
      if (aCity !== bCity) return aCity.localeCompare(bCity);

      const aState = normalize(a.state);
      const bState = normalize(b.state);
      if (aState !== bState) return aState.localeCompare(bState);

      return (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase());
    });
  const readyNotRunVenues = readyNotRunAll.slice(0, 120);
  readyNotRunVenues.forEach((venue) => {
    const tournamentIds = tournamentIdsByVenue.get(venue.id) ?? new Set<string>();
    const names: string[] = [];
    tournamentIds.forEach((tournamentId) => {
      const name = tournamentNameById.get(tournamentId);
      if (name && !names.includes(name)) names.push(name);
    });
    if (names.length) tournamentNamesByVenue.set(venue.id, names);
  });

  const readyDebug = {
    total_fetched: allVenues.length,
    has_address_or_geo: readyCandidates.length,
    already_has_owl_run: runVenueIds.size,
    not_run_candidates: notRunCandidates.length,
    linked_candidates: Array.from(linkedTournamentCountByVenue.keys()).length,
    not_run_with_no_linked_tournaments: noLinkedTournamentCandidates.length,
    not_run_with_junk_name: junkNameCandidates.length,
    final_ready_after_filters: readyNotRunAll.length,
    displayed_ready_rows: readyNotRunVenues.length,
    tournament_name_lookup_error: tournamentNameLookupError,
    query_note: "Venues are pre-filtered server-side for non-null city/state and non-null address/address1 before applying run/link filters.",
    sample_not_run_no_linked: noLinkedTournamentCandidates.slice(0, 5).map((venue) => ({
      id: venue.id,
      name: venue.name,
      city: venue.city,
      state: venue.state,
    })),
    sample_not_run_junk_name: junkNameCandidates.slice(0, 5).map((venue) => ({
      id: venue.id,
      name: venue.name,
      city: venue.city,
      state: venue.state,
    })),
  };

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <OwlsEyePanel
        embedded
        adminToken={adminToken || undefined}
        initialVenueId={venueId || undefined}
        readyDebug={readyDebug}
        readyNotRunTotal={readyNotRunAll.length}
        readyNotRunVenues={readyNotRunVenues.map((venue) => {
          const linkedTournamentNames = tournamentNamesByVenue.get(venue.id) ?? [];
          const linkedTournamentSports = tournamentSportsByVenue.get(venue.id) ?? [];
          const linkedTournamentCount = linkedTournamentCountByVenue.get(venue.id) ?? linkedTournamentNames.length;
          return {
            venue_id: venue.id,
            name: venue.name,
            street: pickStreetAddress(venue) || null,
            city: venue.city,
            state: venue.state,
            zip: venue.zip,
            sport: null,
            tournament_count: linkedTournamentCount,
            tournament_names: linkedTournamentNames.slice(0, 8),
            tournament_sports: linkedTournamentSports.sort((a, b) => a.localeCompare(b)),
          };
        })}
      />
    </div>
  );
}
