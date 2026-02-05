-- Public URL suggestions for tournaments
create table if not exists public.tournament_url_suggestions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  suggested_url text not null,
  suggested_domain text,
  submitter_email text,
  status text not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists tournament_url_suggestions_tournament_time_idx
  on public.tournament_url_suggestions (tournament_id, created_at desc);

create index if not exists tournament_url_suggestions_status_idx
  on public.tournament_url_suggestions (status, created_at desc);

create unique index if not exists tournament_url_suggestions_unique_idx
  on public.tournament_url_suggestions (tournament_id, suggested_url);

alter table public.tournament_url_suggestions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'admin_all_tournament_url_suggestions'
  ) then
    create policy admin_all_tournament_url_suggestions
      on public.tournament_url_suggestions
      for all
      using (is_admin())
      with check (is_admin());
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'public_insert_tournament_url_suggestions'
  ) then
    create policy public_insert_tournament_url_suggestions
      on public.tournament_url_suggestions
      for insert
      with check (true);
  end if;
end $$;
