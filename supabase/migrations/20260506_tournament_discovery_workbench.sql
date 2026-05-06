-- Tournament discovery workbench (Chat-assisted; admin-only)
-- Creates:
--  - public.discovery_searches
--  - public.discovery_batches
--  - public.tournament_discovery_candidates
-- All tables are service_role only (RLS enabled).

do $$
begin
  if to_regclass('public.discovery_searches') is null then
    create table public.discovery_searches (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      search_key text not null,
      sport text not null,
      state text not null,
      metro text null,
      venue_id uuid null references public.venues(id) on delete set null,
      organizer text null,
      date_range_start date not null,
      date_range_end date not null,
      search_type text not null,
      generated_prompt text not null,
      prompt_version text not null default 'v1',
      prompt_hash text null,
      result_count integer not null default 0,
      coverage_status text not null default 'weak',
      last_run_at timestamptz null,
      last_run_by uuid null,
      last_run_model text null,
      last_run_notes text null,
      actual_prompt_sent text null
    );

    create unique index discovery_searches_search_key_uidx
      on public.discovery_searches (search_key);

    create index discovery_searches_state_sport_idx
      on public.discovery_searches (state, sport);

    create index discovery_searches_coverage_last_run_idx
      on public.discovery_searches (coverage_status, last_run_at desc);

    alter table public.discovery_searches enable row level security;
    revoke all on table public.discovery_searches from public, anon, authenticated;
    grant all on table public.discovery_searches to service_role;
  end if;

  if to_regclass('public.discovery_batches') is null then
    create table public.discovery_batches (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      created_by uuid null,
      discovery_search_id uuid null references public.discovery_searches(id) on delete set null,
      raw_paste text not null,
      model text null,
      provider text null,
      generated_prompt text null,
      actual_prompt_sent text null,
      notes text null
    );

    create index discovery_batches_created_at_idx
      on public.discovery_batches (created_at desc);

    create index discovery_batches_search_created_at_idx
      on public.discovery_batches (discovery_search_id, created_at desc);

    alter table public.discovery_batches enable row level security;
    revoke all on table public.discovery_batches from public, anon, authenticated;
    grant all on table public.discovery_batches to service_role;
  end if;

  if to_regclass('public.tournament_discovery_candidates') is null then
    create table public.tournament_discovery_candidates (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      discovery_search_id uuid null references public.discovery_searches(id) on delete set null,
      discovery_batch_id uuid not null references public.discovery_batches(id) on delete cascade,
      name text not null,
      sport text not null,
      start_date date not null,
      end_date date not null,
      city text not null,
      state text not null,
      venue_raw text null,
      organizer text null,
      official_website_url text null,
      source_url text not null,
      raw_row_json jsonb not null,
      source_domain text null,
      normalized_name text not null,
      confidence_label text not null default 'medium',
      dedupe_status text not null default 'unreviewed',
      dedupe_target_tournament_id uuid null references public.tournaments(id) on delete set null,
      dedupe_score numeric null,
      seen_before boolean not null default false,
      seen_before_candidate_id uuid null references public.tournament_discovery_candidates(id) on delete set null,
      import_status text not null default 'queued',
      review_notes text null,
      reviewed_by uuid null,
      reviewed_at timestamptz null,
      imported_tournament_id uuid null references public.tournaments(id) on delete set null,
      imported_at timestamptz null,
      constraint tournament_discovery_candidates_dates_chk check (start_date <= end_date),
      constraint tournament_discovery_candidates_confidence_chk check (confidence_label in ('high','medium','low')),
      constraint tournament_discovery_candidates_dedupe_chk check (dedupe_status in ('unreviewed','exact','likely','possible','none')),
      constraint tournament_discovery_candidates_import_chk check (import_status in ('queued','rejected','imported'))
    );

    create index tournament_discovery_candidates_import_created_at_idx
      on public.tournament_discovery_candidates (import_status, created_at desc);

    create index tournament_discovery_candidates_state_sport_start_idx
      on public.tournament_discovery_candidates (state, sport, start_date);

    create index tournament_discovery_candidates_normalized_name_idx
      on public.tournament_discovery_candidates (normalized_name);

    create index tournament_discovery_candidates_source_domain_idx
      on public.tournament_discovery_candidates (source_domain);

    create index tournament_discovery_candidates_batch_idx
      on public.tournament_discovery_candidates (discovery_batch_id);

    alter table public.tournament_discovery_candidates enable row level security;
    revoke all on table public.tournament_discovery_candidates from public, anon, authenticated;
    grant all on table public.tournament_discovery_candidates to service_role;
  end if;
end $$;

-- Keep updated_at current on updates (service-role only).
do $$
begin
  if to_regclass('public._discovery_workbench_set_updated_at') is null then
    create or replace function public._discovery_workbench_set_updated_at()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;

  if to_regclass('public.discovery_searches') is not null then
    drop trigger if exists discovery_searches_set_updated_at on public.discovery_searches;
    create trigger discovery_searches_set_updated_at
    before update on public.discovery_searches
    for each row
    execute function public._discovery_workbench_set_updated_at();
  end if;

  if to_regclass('public.discovery_batches') is not null then
    drop trigger if exists discovery_batches_set_updated_at on public.discovery_batches;
    create trigger discovery_batches_set_updated_at
    before update on public.discovery_batches
    for each row
    execute function public._discovery_workbench_set_updated_at();
  end if;

  if to_regclass('public.tournament_discovery_candidates') is not null then
    drop trigger if exists tournament_discovery_candidates_set_updated_at on public.tournament_discovery_candidates;
    create trigger tournament_discovery_candidates_set_updated_at
    before update on public.tournament_discovery_candidates
    for each row
    execute function public._discovery_workbench_set_updated_at();
  end if;
end $$;

