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
    .not("name", "is", null)
    .order("state", { ascending: true })
    .order("city", { ascending: true })
    .order("name", { ascending: true })
    .limit(1200);

  const allVenues = (readyVenuesRaw ?? []) as ReadyVenueRow[];
  const readyCandidates = allVenues.filter((venue) => {
    const hasAddress = Boolean((venue.address1 ?? venue.address ?? "").trim()) && Boolean((venue.city ?? "").trim()) && Boolean((venue.state ?? "").trim());
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

    const linkRows: Array<{ venue_id: string | null; tournament_id: string | null }> = [];
    for (const idChunk of chunkValues(venueIds)) {
      const { data: venueLinks } = await supabaseAdmin
        .from("tournament_venues" as any)
        .select("venue_id,tournament_id")
        .in("venue_id", idChunk);
      linkRows.push(...((venueLinks ?? []) as Array<{ venue_id: string | null; tournament_id: string | null }>));
    }
    linkRows.forEach((row) => {
      if (!row.venue_id || !row.tournament_id) return;
      linkedTournamentCountByVenue.set(row.venue_id, (linkedTournamentCountByVenue.get(row.venue_id) ?? 0) + 1);
    });
    const tournamentIds = Array.from(
      new Set(linkRows.map((row) => row.tournament_id).filter((value): value is string => Boolean(value)))
    );
    const tournamentNameById = new Map<string, string>();
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
    linkRows.forEach((row) => {
      if (!row.venue_id || !row.tournament_id) return;
      const tournamentName = tournamentNameById.get(row.tournament_id);
      if (!tournamentName) return;
      const existing = tournamentNamesByVenue.get(row.venue_id) ?? [];
      if (!existing.includes(tournamentName)) existing.push(tournamentName);
      tournamentNamesByVenue.set(row.venue_id, existing);
      const sport = tournamentSportById.get(row.tournament_id);
      if (sport) {
        const existingSports = tournamentSportsByVenue.get(row.venue_id) ?? [];
        if (!existingSports.includes(sport)) existingSports.push(sport);
        tournamentSportsByVenue.set(row.venue_id, existingSports);
      }
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
      const aCount = linkedTournamentCountByVenue.get(a.id) ?? 0;
      const bCount = linkedTournamentCountByVenue.get(b.id) ?? 0;
      if (aCount !== bCount) return bCount - aCount;

      const aAddress = (a.address1 ?? a.address ?? "").toLowerCase().trim();
      const bAddress = (b.address1 ?? b.address ?? "").toLowerCase().trim();
      if (aAddress !== bAddress) return aAddress.localeCompare(bAddress);
      const aCity = (a.city ?? "").toLowerCase();
      const bCity = (b.city ?? "").toLowerCase();
      if (aCity !== bCity) return aCity.localeCompare(bCity);
      const aState = (a.state ?? "").toLowerCase();
      const bState = (b.state ?? "").toLowerCase();
      if (aState !== bState) return aState.localeCompare(bState);
      const aPrimarySport = (tournamentSportsByVenue.get(a.id) ?? []).slice().sort((x, y) => x.localeCompare(y))[0] ?? "";
      const bPrimarySport = (tournamentSportsByVenue.get(b.id) ?? []).slice().sort((x, y) => x.localeCompare(y))[0] ?? "";
      if (aPrimarySport !== bPrimarySport) return aPrimarySport.localeCompare(bPrimarySport);
      return (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase());
    });
  const readyNotRunVenues = readyNotRunAll.slice(0, 120);

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
            street: venue.address1 ?? venue.address ?? null,
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
