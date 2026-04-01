-- Security hardening: enable RLS + policies for assignor/enrichment supporting tables.
--
-- Production validation (2026-04-01): these tables exist but had RLS disabled, which Supabase linter flags.
-- This migration is written to be safe across envs where some tables might not exist yet.

do $$
begin
  -- Public-facing: Assignor Directory filters need these readable for anon/authenticated,
  -- but only for approved assignors.
  if to_regclass('public.assignor_zip_codes') is not null then
    alter table public.assignor_zip_codes enable row level security;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'assignor_zip_codes'
        and policyname = 'assignor_zip_codes_select_public'
    ) then
      create policy assignor_zip_codes_select_public
        on public.assignor_zip_codes
        for select
        using (
          exists (
            select 1
            from public.assignors a
            where a.id = assignor_id
              and a.review_status = 'approved'
          )
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'assignor_zip_codes'
        and policyname = 'admin_all_assignor_zip_codes'
    ) then
      create policy admin_all_assignor_zip_codes
        on public.assignor_zip_codes
        for all
        using (public.is_admin())
        with check (public.is_admin());
    end if;
  end if;

  if to_regclass('public.assignor_coverage') is not null then
    alter table public.assignor_coverage enable row level security;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'assignor_coverage'
        and policyname = 'assignor_coverage_select_public'
    ) then
      create policy assignor_coverage_select_public
        on public.assignor_coverage
        for select
        using (
          exists (
            select 1
            from public.assignors a
            where a.id = assignor_id
              and a.review_status = 'approved'
          )
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'assignor_coverage'
        and policyname = 'admin_all_assignor_coverage'
    ) then
      create policy admin_all_assignor_coverage
        on public.assignor_coverage
        for all
        using (public.is_admin())
        with check (public.is_admin());
    end if;
  end if;

  -- Admin / service-role only tables.
  if to_regclass('public.assignor_sources') is not null then
    alter table public.assignor_sources enable row level security;
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'assignor_sources'
        and policyname = 'admin_all_assignor_sources'
    ) then
      create policy admin_all_assignor_sources
        on public.assignor_sources
        for all
        using (public.is_admin())
        with check (public.is_admin());
    end if;
  end if;

  if to_regclass('public.assignor_crawl_runs') is not null then
    alter table public.assignor_crawl_runs enable row level security;
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'assignor_crawl_runs'
        and policyname = 'admin_all_assignor_crawl_runs'
    ) then
      create policy admin_all_assignor_crawl_runs
        on public.assignor_crawl_runs
        for all
        using (public.is_admin())
        with check (public.is_admin());
    end if;
  end if;

  if to_regclass('public.assignor_source_records') is not null then
    alter table public.assignor_source_records enable row level security;
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'assignor_source_records'
        and policyname = 'admin_all_assignor_source_records'
    ) then
      create policy admin_all_assignor_source_records
        on public.assignor_source_records
        for all
        using (public.is_admin())
        with check (public.is_admin());
    end if;
  end if;

  if to_regclass('public.city_zip_codes') is not null then
    alter table public.city_zip_codes enable row level security;
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'city_zip_codes'
        and policyname = 'admin_all_city_zip_codes'
    ) then
      create policy admin_all_city_zip_codes
        on public.city_zip_codes
        for all
        using (public.is_admin())
        with check (public.is_admin());
    end if;
  end if;

  if to_regclass('public.tournament_date_candidates') is not null then
    alter table public.tournament_date_candidates enable row level security;
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'tournament_date_candidates'
        and policyname = 'admin_all_tournament_date_candidates'
    ) then
      create policy admin_all_tournament_date_candidates
        on public.tournament_date_candidates
        for all
        using (public.is_admin())
        with check (public.is_admin());
    end if;
  end if;
end $$;

-- Keep grants tight for admin tables (RLS is the real guard; service_role bypasses RLS).
revoke all on table public.assignor_sources from public, anon, authenticated;
revoke all on table public.assignor_crawl_runs from public, anon, authenticated;
revoke all on table public.assignor_source_records from public, anon, authenticated;
revoke all on table public.city_zip_codes from public, anon, authenticated;
revoke all on table public.tournament_date_candidates from public, anon, authenticated;

grant select, insert, update, delete on table public.assignor_sources to service_role;
grant select, insert, update, delete on table public.assignor_crawl_runs to service_role;
grant select, insert, update, delete on table public.assignor_source_records to service_role;
grant select, insert, update, delete on table public.city_zip_codes to service_role;
grant select, insert, update, delete on table public.tournament_date_candidates to service_role;

-- Public read tables: allow anon/auth select (filtered by RLS policy), admin/service write.
grant select on table public.assignor_zip_codes to anon, authenticated;
grant select on table public.assignor_coverage to anon, authenticated;
grant select, insert, update, delete on table public.assignor_zip_codes to service_role;
grant select, insert, update, delete on table public.assignor_coverage to service_role;
