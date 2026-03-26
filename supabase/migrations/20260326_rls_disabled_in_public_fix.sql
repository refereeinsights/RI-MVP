-- Fix Supabase Security Advisor lint: rls_disabled_in_public
-- Enable RLS on tables in the public schema that are exposed to PostgREST.
-- Then add explicit policies so we keep intended access:
-- - Most tables: admin-only via is_admin()
-- - school_referee_scores_by_sport: allow public read of "clear" rows for the schools UI.

alter table if exists public.airports enable row level security;
alter table if exists public.school_referee_scores_by_sport enable row level security;
alter table if exists public.sport_validation_rules enable row level security;
alter table if exists public.tournament_partner_nearby enable row level security;
alter table if exists public.tournament_sport_validation enable row level security;
alter table if exists public.venue_duplicate_overrides enable row level security;
alter table if exists public.venue_quick_check_events enable row level security;
alter table if exists public.venue_quick_checks enable row level security;
alter table if exists public.venue_sport_profiles enable row level security;

do $$
begin
  -- Airports: internal reference table used by admin jobs/services.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'airports'
      and policyname = 'admin_all_airports'
  ) then
    create policy admin_all_airports
      on public.airports
      for all
      using (is_admin())
      with check (is_admin());
  end if;

  -- School sport whistle score rollups: public read (clear rows), admin write.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'school_referee_scores_by_sport'
      and policyname = 'school_referee_scores_public_select_clear'
  ) then
    create policy school_referee_scores_public_select_clear
      on public.school_referee_scores_by_sport
      for select
      using (status = 'clear');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'school_referee_scores_by_sport'
      and policyname = 'admin_all_school_referee_scores_by_sport'
  ) then
    create policy admin_all_school_referee_scores_by_sport
      on public.school_referee_scores_by_sport
      for all
      using (is_admin())
      with check (is_admin());
  end if;

  -- Sport validation tables: admin-only.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sport_validation_rules'
      and policyname = 'admin_all_sport_validation_rules'
  ) then
    create policy admin_all_sport_validation_rules
      on public.sport_validation_rules
      for all
      using (is_admin())
      with check (is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_sport_validation'
      and policyname = 'admin_all_tournament_sport_validation'
  ) then
    create policy admin_all_tournament_sport_validation
      on public.tournament_sport_validation
      for all
      using (is_admin())
      with check (is_admin());
  end if;

  -- Nearby partners: admin-managed (public pages read via service role).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_partner_nearby'
      and policyname = 'admin_all_tournament_partner_nearby'
  ) then
    create policy admin_all_tournament_partner_nearby
      on public.tournament_partner_nearby
      for all
      using (is_admin())
      with check (is_admin());
  end if;

  -- Venue duplicate overrides: admin-only.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_duplicate_overrides'
      and policyname = 'admin_all_venue_duplicate_overrides'
  ) then
    create policy admin_all_venue_duplicate_overrides
      on public.venue_duplicate_overrides
      for all
      using (is_admin())
      with check (is_admin());
  end if;

  -- TI quick check tables: inserted/queried server-side; lock down direct PostgREST access.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_quick_check_events'
      and policyname = 'admin_all_venue_quick_check_events'
  ) then
    create policy admin_all_venue_quick_check_events
      on public.venue_quick_check_events
      for all
      using (is_admin())
      with check (is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_quick_checks'
      and policyname = 'admin_all_venue_quick_checks'
  ) then
    create policy admin_all_venue_quick_checks
      on public.venue_quick_checks
      for all
      using (is_admin())
      with check (is_admin());
  end if;

  -- Venue sport profiles: admin-only (public pages read via service role).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_sport_profiles'
      and policyname = 'admin_all_venue_sport_profiles'
  ) then
    create policy admin_all_venue_sport_profiles
      on public.venue_sport_profiles
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;

