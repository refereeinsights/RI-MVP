import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import EnrichmentClient from "./EnrichmentClient";

type Tournament = { id: string; name: string | null; url: string | null; state: string | null };
type MissingUrlTournament = {
  id: string;
  name: string | null;
  slug?: string | null;
  state: string | null;
  city: string | null;
  sport: string | null;
  level: string | null;
  source_url?: string | null;
};
type Job = {
  id: string;
  tournament_id: string;
  tournament_name?: string | null;
  tournament_url?: string | null;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  pages_fetched_count: number | null;
  last_error: string | null;
};

type ContactCandidate = {
  id: string;
  tournament_id: string;
  email: string | null;
  phone: string | null;
  role_normalized: string | null;
  source_url: string | null;
  confidence: number | null;
  created_at: string | null;
};

type VenueCandidate = {
  id: string;
  tournament_id: string;
  venue_name: string | null;
  address_text: string | null;
  source_url: string | null;
  confidence: number | null;
  created_at: string | null;
};

type CompCandidate = {
  id: string;
  tournament_id: string;
  rate_text: string | null;
  travel_housing_text: string | null;
  source_url: string | null;
  confidence: number | null;
  created_at: string | null;
};
type DateCandidate = {
  id: string;
  tournament_id: string;
  date_text: string | null;
  start_date: string | null;
  end_date: string | null;
  source_url: string | null;
  confidence: number | null;
  created_at: string | null;
};
type UrlSuggestion = {
  id: string;
  tournament_id: string;
  suggested_url: string;
  suggested_domain: string | null;
  submitter_email: string | null;
  status: string;
  created_at: string;
};

async function loadData() {
  const supabase = createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return {
      tournaments: [],
      jobs: [],
      contacts: [],
      venues: [],
      comps: [],
      dates: [],
      missing_urls: [],
      tournament_url_lookup: {},
      candidate_tournaments: {},
      url_suggestions: [],
    };
  }
  const tournamentsResp = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,name,source_url,state,enrichment_skip")
    .order("created_at", { ascending: false })
    .limit(25);
  const missingResp = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,name,slug,state,city,sport,level,source_url,official_website_url,enrichment_skip,start_date")
    .or("official_website_url.is.null,official_website_url.eq.")
    .eq("enrichment_skip", false)
    .gte("start_date", new Date().toISOString().slice(0, 10))
    .order("start_date", { ascending: true, nullsFirst: false })
    .limit(50);
  const tournamentLookup = new Map<string, { name: string | null; url: string | null }>(
    (tournamentsResp.data ?? []).map((t: any) => [
      t.id,
      { name: t.name ?? null, url: t.source_url ?? null },
    ])
  );
  const jobsResp = await supabaseAdmin
    .from("tournament_enrichment_jobs" as any)
    .select("id,tournament_id,status,created_at,started_at,finished_at,pages_fetched_count,last_error,tournaments(name,source_url)")
    .order("created_at", { ascending: false })
    .limit(20);
  const blocked = new Set<string>(
    (jobsResp.data ?? [])
      .filter((j: any) => ["queued", "running", "done"].includes(String(j.status)))
      .map((j: any) => j.tournament_id)
  );
  const contactsResp = await supabaseAdmin
    .from("tournament_contact_candidates" as any)
    .select("id,tournament_id,email,phone,role_normalized,source_url,confidence,created_at")
    .is("accepted_at", null)
    .is("rejected_at", null)
    .order("created_at", { ascending: false })
    .limit(25);
  const venuesResp = await supabaseAdmin
    .from("tournament_venue_candidates" as any)
    .select("id,tournament_id,venue_name,address_text,source_url,confidence,created_at")
    .is("accepted_at", null)
    .is("rejected_at", null)
    .order("created_at", { ascending: false })
    .limit(25);
  const compsResp = await supabaseAdmin
    .from("tournament_referee_comp_candidates" as any)
    .select("id,tournament_id,rate_text,travel_housing_text,source_url,confidence,created_at")
    .is("accepted_at", null)
    .is("rejected_at", null)
    .order("created_at", { ascending: false })
    .limit(25);
  const datesResp = await supabaseAdmin
    .from("tournament_date_candidates" as any)
    .select("id,tournament_id,date_text,start_date,end_date,source_url,confidence,created_at")
    .is("accepted_at", null)
    .is("rejected_at", null)
    .order("created_at", { ascending: false })
    .limit(25);
  const candidateIds = new Set<string>();
  (contactsResp.data ?? []).forEach((row: any) => row.tournament_id && candidateIds.add(row.tournament_id));
  (venuesResp.data ?? []).forEach((row: any) => row.tournament_id && candidateIds.add(row.tournament_id));
  (compsResp.data ?? []).forEach((row: any) => row.tournament_id && candidateIds.add(row.tournament_id));
  (datesResp.data ?? []).forEach((row: any) => row.tournament_id && candidateIds.add(row.tournament_id));
  let tournamentUrlLookup: Record<string, string | null> = {};
  let candidateTournamentLookup: Record<string, { name: string | null; slug: string | null; state: string | null; city: string | null; url: string | null }> = {};
  if (candidateIds.size > 0) {
    const lookupResp = await supabaseAdmin
      .from("tournaments" as any)
      .select("id,name,slug,state,city,source_url,official_website_url")
      .in("id", Array.from(candidateIds))
      .limit(200);
    tournamentUrlLookup = Object.fromEntries(
      (lookupResp.data ?? []).map((row: any) => [row.id, row.source_url ?? row.official_website_url ?? null])
    );
    candidateTournamentLookup = Object.fromEntries(
      (lookupResp.data ?? []).map((row: any) => [
        row.id,
        {
          name: row.name ?? null,
          slug: row.slug ?? null,
          state: row.state ?? null,
          city: row.city ?? null,
          url: row.official_website_url ?? row.source_url ?? null,
        },
      ])
    );
  }
  const suggestionsResp = await supabaseAdmin
    .from("tournament_url_suggestions" as any)
    .select("id,tournament_id,suggested_url,suggested_domain,submitter_email,status,created_at,tournaments(name,state)")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);
  return {
    tournaments:
      (tournamentsResp.data ?? [])
        .filter((t: any) => !t.enrichment_skip && !blocked.has(t.id))
        .map((t: any) => ({
          id: t.id,
          name: t.name ?? null,
          state: t.state ?? null,
          url: t.source_url ?? null,
        })) as Tournament[],
    jobs:
      (jobsResp.data ?? []).map((j: any) => {
        const fallback = tournamentLookup.get(j.tournament_id) ?? { name: null, url: null };
        return {
          ...j,
          tournament_name: j.tournaments?.name ?? fallback.name,
          tournament_url: j.tournaments?.source_url ?? fallback.url,
        };
      }) as Job[],
    missing_urls:
      (missingResp.data ?? [])
        .filter((t: any) => !t.official_website_url && !t.enrichment_skip)
        .map((t: any) => ({
          id: t.id,
          name: t.name ?? null,
          slug: t.slug ?? null,
          state: t.state ?? null,
          city: t.city ?? null,
          sport: t.sport ?? null,
          level: t.level ?? null,
          source_url: t.source_url ?? null,
          start_date: t.start_date ?? null,
        })) as MissingUrlTournament[],
    contacts: (contactsResp.data ?? []) as ContactCandidate[],
    venues: (venuesResp.data ?? []) as VenueCandidate[],
    comps: (compsResp.data ?? []) as CompCandidate[],
    dates: (datesResp.data ?? []) as DateCandidate[],
    tournament_url_lookup: tournamentUrlLookup,
    candidate_tournaments: candidateTournamentLookup,
    url_suggestions:
      (suggestionsResp.data ?? []).map((row: any) => ({
        id: row.id,
        tournament_id: row.tournament_id,
        suggested_url: row.suggested_url,
        suggested_domain: row.suggested_domain ?? null,
        submitter_email: row.submitter_email ?? null,
        status: row.status ?? "pending",
        created_at: row.created_at,
        tournament_name: row.tournaments?.name ?? null,
        tournament_state: row.tournaments?.state ?? null,
      })) as (UrlSuggestion & { tournament_name?: string | null; tournament_state?: string | null })[],
  };
}

export default async function Page() {
  const data = await loadData();
  return (
    <EnrichmentClient
      tournaments={data.tournaments}
      missingUrls={data.missing_urls}
      jobs={data.jobs}
      contacts={data.contacts}
      venues={data.venues}
      comps={data.comps}
      dates={data.dates}
      urlSuggestions={data.url_suggestions}
      tournamentUrlLookup={data.tournament_url_lookup}
      candidateTournaments={data.candidate_tournaments}
    />
  );
}
