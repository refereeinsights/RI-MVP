-- Fix policy checks that used pg_policies.polname (Postgres 15 uses policyname)

-- Ensure RLS is enabled
alter table if exists public.tournament_enrichment_jobs enable row level security;
alter table if exists public.tournament_contact_candidates enable row level security;
alter table if exists public.tournament_venue_candidates enable row level security;
alter table if exists public.tournament_referee_comp_candidates enable row level security;
alter table if exists public.tournament_sources enable row level security;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tournament_enrichment_jobs') then
    if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_enrichment_jobs') then
      create policy admin_all_tournament_enrichment_jobs
        on public.tournament_enrichment_jobs
        for all
        using (public.is_admin())
        with check (public.is_admin());
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tournament_contact_candidates') then
    if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_contact_candidates') then
      create policy admin_all_tournament_contact_candidates
        on public.tournament_contact_candidates
        for all
        using (public.is_admin())
        with check (public.is_admin());
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tournament_venue_candidates') then
    if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_venue_candidates') then
      create policy admin_all_tournament_venue_candidates
        on public.tournament_venue_candidates
        for all
        using (public.is_admin())
        with check (public.is_admin());
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tournament_referee_comp_candidates') then
    if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_referee_comp_candidates') then
      create policy admin_all_tournament_referee_comp_candidates
        on public.tournament_referee_comp_candidates
        for all
        using (public.is_admin())
        with check (public.is_admin());
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tournament_sources') then
    if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_sources') then
      create policy admin_all_tournament_sources
        on public.tournament_sources
        for all
        using (public.is_admin())
        with check (public.is_admin());
    end if;
  end if;
end $$;
