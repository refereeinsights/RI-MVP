-- Unapplied. Human-review queue for proposed enrichment changes to existing
-- production tournaments. Research/MCP tools write proposals here only.
-- Production mutations happen exclusively through applyTournamentEnrichmentProposal.

create table if not exists public.tournament_enrichment_proposals (
  id                uuid          primary key default gen_random_uuid(),
  tournament_id     uuid          not null references public.tournaments(id) on delete cascade,

  status            text          not null default 'pending_review'
    check (status in (
      'pending_review', 'needs_verification', 'approved', 'rejected', 'applied'
    )),

  action_type       text          not null
    check (action_type in (
      'add_official_source', 'correct_dates', 'add_venue', 'add_additional_venue',
      'correct_venue', 'correct_tournament_location', 'merge_duplicate', 'manual_review'
    )),

  field_name        text          null,
  current_value     jsonb         null,
  proposed_value    jsonb         null,

  source_url        text          null,
  venue_source_url  text          null,

  confidence        text          not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),

  evidence_summary  text          not null default '',
  research_notes    text          null,

  proposed_by       text          null,

  reviewed_by       uuid          null references auth.users(id),
  applied_by        uuid          null references auth.users(id),

  researched_at     timestamptz   null,
  reviewed_at       timestamptz   null,
  applied_at        timestamptz   null,

  rejection_reason  text          null,
  source_batch_id   text          null,

  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

create index if not exists tep_tournament_id_idx on public.tournament_enrichment_proposals (tournament_id);
create index if not exists tep_status_idx        on public.tournament_enrichment_proposals (status);
create index if not exists tep_action_type_idx   on public.tournament_enrichment_proposals (action_type);
create index if not exists tep_source_batch_idx  on public.tournament_enrichment_proposals (source_batch_id);
create index if not exists tep_created_at_idx    on public.tournament_enrichment_proposals (created_at desc);

create or replace function public.set_tep_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tep_updated_at
  before update on public.tournament_enrichment_proposals
  for each row execute function public.set_tep_updated_at();
