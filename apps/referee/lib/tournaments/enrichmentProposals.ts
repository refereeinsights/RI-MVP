import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type EnrichmentProposalStatus =
  | "pending_review"
  | "needs_verification"
  | "approved"
  | "rejected"
  | "applied";

export type EnrichmentProposalActionType =
  | "add_official_source"
  | "correct_dates"
  | "add_venue"
  | "add_additional_venue"
  | "correct_venue"
  | "correct_tournament_location"
  | "merge_duplicate"
  | "manual_review";

export type EnrichmentProposalConfidence = "high" | "medium" | "low";

export type EnrichmentProposalRow = {
  id: string;
  tournament_id: string;
  status: EnrichmentProposalStatus;
  action_type: EnrichmentProposalActionType;
  field_name: string | null;
  current_value: Record<string, unknown> | null;
  proposed_value: Record<string, unknown> | null;
  source_url: string | null;
  venue_source_url: string | null;
  confidence: EnrichmentProposalConfidence;
  evidence_summary: string;
  research_notes: string | null;
  proposed_by: string | null;
  reviewed_by: string | null;
  applied_by: string | null;
  researched_at: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  rejection_reason: string | null;
  source_batch_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EnrichmentProposalTournamentContext = {
  id: string;
  name: string | null;
  slug: string | null;
  sport: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  state: string | null;
  official_website_url: string | null;
};

export type LinkedVenue = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
};

export type EnrichmentProposalWithContext = EnrichmentProposalRow & {
  tournament: EnrichmentProposalTournamentContext | null;
  linked_venues: LinkedVenue[];
};

export type EnrichmentProposalFilters = {
  status?: string;
  action_type?: string;
  sport?: string;
  state?: string;
  tournament_id?: string;
  source_batch_id?: string;
  limit?: number;
  offset?: number;
};

export type EnrichmentProposalCounts = Record<EnrichmentProposalStatus, number>;

export async function getEnrichmentProposalCounts(): Promise<EnrichmentProposalCounts> {
  const counts: EnrichmentProposalCounts = {
    pending_review: 0,
    needs_verification: 0,
    approved: 0,
    applied: 0,
    rejected: 0,
  };
  const { data } = await (supabaseAdmin.from("tournament_enrichment_proposals" as any) as any)
    .select("status");
  for (const row of data ?? []) {
    const s = row.status as EnrichmentProposalStatus;
    if (s in counts) counts[s]++;
  }
  return counts;
}

export async function listTournamentEnrichmentProposals(
  filters: EnrichmentProposalFilters = {}
): Promise<EnrichmentProposalWithContext[]> {
  const { status, action_type, tournament_id, source_batch_id, limit = 50, offset = 0 } = filters;

  let q = (supabaseAdmin.from("tournament_enrichment_proposals" as any) as any)
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) q = q.eq("status", status);
  if (action_type) q = q.eq("action_type", action_type);
  if (tournament_id) q = q.eq("tournament_id", tournament_id);
  if (source_batch_id) q = q.eq("source_batch_id", source_batch_id);

  const { data: proposals } = await q;
  if (!proposals?.length) return [];

  const tournamentIds = [...new Set((proposals as any[]).map((p: any) => p.tournament_id as string))];

  let tq = (supabaseAdmin.from("tournaments" as any) as any)
    .select("id,name,slug,sport,status,start_date,end_date,city,state,official_website_url")
    .in("id", tournamentIds);
  if (filters.sport) tq = tq.eq("sport", filters.sport);
  if (filters.state) tq = tq.eq("state", filters.state);

  const { data: tournaments } = await tq;
  const tournamentMap = new Map<string, EnrichmentProposalTournamentContext>();
  for (const t of tournaments ?? []) tournamentMap.set(t.id, t);

  // Batch-load venue links
  const { data: venueLinks } = await (supabaseAdmin.from("tournament_venues" as any) as any)
    .select("tournament_id,venue_id")
    .in("tournament_id", tournamentIds)
    .eq("is_inferred", false);

  const venueIds = [...new Set((venueLinks ?? []).map((l: any) => l.venue_id as string))];
  const venueMap = new Map<string, LinkedVenue>();
  if (venueIds.length) {
    const { data: venues } = await (supabaseAdmin.from("venues" as any) as any)
      .select("id,name,city,state")
      .in("id", venueIds);
    for (const v of venues ?? []) venueMap.set(v.id, { id: v.id, name: v.name, city: v.city, state: v.state });
  }

  const venuesByTournament = new Map<string, LinkedVenue[]>();
  for (const link of venueLinks ?? []) {
    const v = venueMap.get(link.venue_id);
    if (!v) continue;
    const arr = venuesByTournament.get(link.tournament_id) ?? [];
    arr.push(v);
    venuesByTournament.set(link.tournament_id, arr);
  }

  const hasLocationFilter = Boolean(filters.sport || filters.state);

  return (proposals as any[])
    .filter((p: any) => !hasLocationFilter || tournamentMap.has(p.tournament_id))
    .map((p: any): EnrichmentProposalWithContext => ({
      id: p.id,
      tournament_id: p.tournament_id,
      status: p.status,
      action_type: p.action_type,
      field_name: p.field_name ?? null,
      current_value: p.current_value ?? null,
      proposed_value: p.proposed_value ?? null,
      source_url: p.source_url ?? null,
      venue_source_url: p.venue_source_url ?? null,
      confidence: p.confidence,
      evidence_summary: p.evidence_summary ?? "",
      research_notes: p.research_notes ?? null,
      proposed_by: p.proposed_by ?? null,
      reviewed_by: p.reviewed_by ?? null,
      applied_by: p.applied_by ?? null,
      researched_at: p.researched_at ?? null,
      reviewed_at: p.reviewed_at ?? null,
      applied_at: p.applied_at ?? null,
      rejection_reason: p.rejection_reason ?? null,
      source_batch_id: p.source_batch_id ?? null,
      created_at: p.created_at,
      updated_at: p.updated_at,
      tournament: tournamentMap.get(p.tournament_id) ?? null,
      linked_venues: venuesByTournament.get(p.tournament_id) ?? [],
    }));
}
