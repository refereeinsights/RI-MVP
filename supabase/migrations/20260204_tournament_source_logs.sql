-- Tournament source logs for sweep/discovery diagnostics
create table if not exists public.tournament_source_logs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.tournament_sources(id) on delete cascade,
  action text not null,
  level text not null default 'info',
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists tournament_source_logs_source_time_idx
  on public.tournament_source_logs (source_id, created_at desc);

alter table public.tournament_source_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'admin_all_tournament_source_logs'
  ) then
    create policy admin_all_tournament_source_logs
      on public.tournament_source_logs
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;
