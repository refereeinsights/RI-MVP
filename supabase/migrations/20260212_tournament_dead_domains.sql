-- Track dead domains to skip future email discovery.
create table if not exists public.tournament_dead_domains (
  domain text primary key,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  reason text
);

alter table public.tournament_dead_domains enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_dead_domains') then
    create policy admin_all_tournament_dead_domains
      on public.tournament_dead_domains
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;
