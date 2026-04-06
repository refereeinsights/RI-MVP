-- Venue import + venue-based discovery provenance (v1)
-- Adds durable, admin-only tables to support:
-- - Venue-only CSV import runs (dry-run + apply)
-- - Venue-driven discovery that persists URLs into tournament_sources while retaining venue/query provenance

create extension if not exists "pgcrypto";

create table if not exists public.venue_import_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  filename text null,
  dry_run boolean not null default true,
  total_rows int not null default 0,
  inserted int not null default 0,
  skipped_existing int not null default 0,
  needs_review int not null default 0,
  invalid int not null default 0,
  parse_errors int not null default 0,
  summary text null
);

create index if not exists venue_import_runs_created_at_idx
  on public.venue_import_runs (created_at desc);

create table if not exists public.venue_import_run_rows (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.venue_import_runs(id) on delete cascade,
  row_number int not null,
  venue_name text null,
  venue_address text null,
  city text null,
  state text null,
  zip text null,
  sport text null,
  venue_url text null,
  source_url text null,
  organization text null,
  confidence text null,
  notes text null,
  action text not null,
  matched_venue_id uuid null references public.venues(id) on delete set null,
  reason text null,
  raw jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists venue_import_run_rows_run_id_idx
  on public.venue_import_run_rows (run_id);

create index if not exists venue_import_run_rows_action_idx
  on public.venue_import_run_rows (action);

create index if not exists venue_import_run_rows_matched_venue_idx
  on public.venue_import_run_rows (matched_venue_id);

-- Venue-based discovery provenance. The canonical URL registry remains tournament_sources.
create table if not exists public.tournament_source_discoveries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  provider text null,
  query text null,
  venue_id uuid null references public.venues(id) on delete set null,
  source_id uuid not null references public.tournament_sources(id) on delete cascade
);

create unique index if not exists tournament_source_discoveries_dedupe_idx
  on public.tournament_source_discoveries (
    coalesce(venue_id, '00000000-0000-0000-0000-000000000000'::uuid),
    source_id,
    coalesce(query, ''),
    coalesce(provider, '')
  );

create index if not exists tournament_source_discoveries_venue_created_idx
  on public.tournament_source_discoveries (venue_id, created_at desc);

alter table if exists public.venue_import_runs enable row level security;
alter table if exists public.venue_import_run_rows enable row level security;
alter table if exists public.tournament_source_discoveries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_import_runs'
      and policyname = 'admin_all_venue_import_runs'
  ) then
    create policy admin_all_venue_import_runs
      on public.venue_import_runs
      for all
      using (is_admin())
      with check (is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_import_run_rows'
      and policyname = 'admin_all_venue_import_run_rows'
  ) then
    create policy admin_all_venue_import_run_rows
      on public.venue_import_run_rows
      for all
      using (is_admin())
      with check (is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_source_discoveries'
      and policyname = 'admin_all_tournament_source_discoveries'
  ) then
    create policy admin_all_tournament_source_discoveries
      on public.tournament_source_discoveries
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;

