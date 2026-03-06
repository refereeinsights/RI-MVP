-- Source performance tracking additions

-- Add attribution columns on tournaments (nullable)
alter table if exists tournaments
  add column if not exists discovery_source_id uuid references public.tournament_sources(id) on delete set null;

alter table if exists tournaments
  add column if not exists discovery_sweep_id uuid references public.tournament_sources(id) on delete set null;

create index if not exists tournaments_discovery_source_id_idx on tournaments(discovery_source_id);
create index if not exists tournaments_discovery_sweep_id_idx on tournaments(discovery_sweep_id);

-- Ensure RLS for tournament_sources uses is_admin()
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tournament_sources') then
    begin
      execute 'alter table public.tournament_sources enable row level security';
    exception when others then
      null;
    end;

    if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_sources') then
      create policy admin_all_tournament_sources
        on public.tournament_sources
        for all
        using (public.is_admin())
        with check (public.is_admin());
    end if;
  end if;
end $$;
