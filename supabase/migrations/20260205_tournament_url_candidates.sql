-- Candidate URLs for tournament enrichment
create table if not exists public.tournament_url_candidates (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  candidate_url text not null,
  candidate_domain text,
  score numeric,
  matched_fields jsonb,
  auto_applied boolean not null default false,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists tournament_url_candidates_tournament_time_idx
  on public.tournament_url_candidates (tournament_id, created_at desc);

create index if not exists tournament_url_candidates_domain_idx
  on public.tournament_url_candidates (candidate_domain);

create unique index if not exists tournament_url_candidates_unique_idx
  on public.tournament_url_candidates (tournament_id, candidate_url);

alter table public.tournament_url_candidates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'admin_all_tournament_url_candidates'
  ) then
    create policy admin_all_tournament_url_candidates
      on public.tournament_url_candidates
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;
