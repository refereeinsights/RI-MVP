-- Security hardening: ensure public-facing views use SECURITY INVOKER semantics.
--
-- Supabase linter flags views that enforce creator permissions (security_invoker=false / default).
-- In production (2026-04-01), these views were present with security_invoker=false or unset.

do $$
begin
  -- Review public views
  if to_regclass('public.tournament_referee_reviews_public') is not null then
    execute 'alter view public.tournament_referee_reviews_public set (security_invoker = true)';
  end if;

  if to_regclass('public.school_referee_reviews_public') is not null then
    execute 'alter view public.school_referee_reviews_public set (security_invoker = true)';
  end if;

  -- Engagement rollup used on tournament pages
  if to_regclass('public.tournament_engagement_rolling') is not null then
    execute 'alter view public.tournament_engagement_rolling set (security_invoker = true)';
  end if;

  -- Public directory view (backed by a function)
  if to_regclass('public.assignor_directory_public') is not null then
    execute 'alter view public.assignor_directory_public set (security_invoker = true)';
  end if;

  -- This view exists in production; definition may be managed outside migrations.
  if to_regclass('public.outreach_dashboard') is not null then
    execute 'alter view public.outreach_dashboard set (security_invoker = true)';
  end if;
end $$;

