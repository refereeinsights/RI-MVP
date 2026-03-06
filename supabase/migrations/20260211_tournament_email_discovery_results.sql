-- Email discovery runs + results for tournaments (admin only)
create table if not exists public.tournament_email_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid null
);

create table if not exists public.tournament_email_discovery_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.tournament_email_discovery_runs(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  source_url text,
  discovered_emails text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists tournament_email_discovery_results_run_idx
  on public.tournament_email_discovery_results(run_id);
create index if not exists tournament_email_discovery_results_tournament_idx
  on public.tournament_email_discovery_results(tournament_id);

create unique index if not exists tournament_email_discovery_results_run_tournament_key
  on public.tournament_email_discovery_results(run_id, tournament_id);

alter table public.tournament_email_discovery_runs enable row level security;
alter table public.tournament_email_discovery_results enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_email_discovery_runs') then
    create policy admin_all_tournament_email_discovery_runs
      on public.tournament_email_discovery_runs
      for all
      using (is_admin())
      with check (is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_email_discovery_results') then
    create policy admin_all_tournament_email_discovery_results
      on public.tournament_email_discovery_results
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;
