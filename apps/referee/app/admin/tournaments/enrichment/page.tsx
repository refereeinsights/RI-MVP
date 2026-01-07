import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import EnrichmentClient from "./EnrichmentClient";

type Tournament = { id: string; name: string | null; url: string | null; state: string | null };
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

async function loadData() {
  const supabase = createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return { tournaments: [], jobs: [], contacts: [], venues: [], comps: [] };
  }
  const tournamentsResp = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,name,source_url,state,enrichment_skip")
    .order("created_at", { ascending: false })
    .limit(25);
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
    contacts: (contactsResp.data ?? []) as ContactCandidate[],
    venues: (venuesResp.data ?? []) as VenueCandidate[],
    comps: (compsResp.data ?? []) as CompCandidate[],
  };
}

export default async function Page() {
  const data = await loadData();
  return (
    <EnrichmentClient
      tournaments={data.tournaments}
      jobs={data.jobs}
      contacts={data.contacts}
      venues={data.venues}
      comps={data.comps}
    />
  );
}
