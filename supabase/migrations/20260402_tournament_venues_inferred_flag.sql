-- Tournament venues inferred flag (v1)
-- Adds a minimal "inferred" marker to tournament_venues so probabilistic links can exist
-- without leaking into confirmed logic (missing-venues, public pages, alerts, etc.).
--
-- Notes:
-- - `is_inferred=false` is treated as confirmed/default behavior.
-- - This migration also updates missing-venues RPC + admin dashboard tiles to count only confirmed links.

do $$
begin
  if to_regclass('public.tournament_venues') is null then
    -- tournament_venues not installed in this env yet.
    return;
  end if;

  alter table public.tournament_venues
    add column if not exists is_inferred boolean not null default false;

  -- Fast-path for "confirmed venues exist?" checks.
  create index if not exists tournament_venues_tournament_confirmed_idx
    on public.tournament_venues (tournament_id)
    where is_inferred = false;

  create index if not exists tournament_venues_venue_confirmed_idx
    on public.tournament_venues (venue_id)
    where is_inferred = false;
end $$;

-- Missing venues chunking helper (confirmed links only).
create or replace function public.list_missing_venue_link_tournaments(
  p_limit integer default 50,
  p_offset integer default 0,
  p_state text default null,
  p_q text default null
)
returns table (
  id uuid,
  name text,
  slug text,
  city text,
  state text,
  start_date date,
  official_website_url text,
  source_url text,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      t.id,
      t.name,
      t.slug,
      t.city,
      t.state,
      t.start_date,
      t.official_website_url,
      t.source_url,
      t.created_at
    from public.tournaments t
    where t.status = 'published'
      and t.is_canonical = true
      and coalesce(t.skip_venue_discovery, false) = false
      and not exists (
        select 1
        from public.tournament_venues tv
        where tv.tournament_id = t.id
          and tv.is_inferred = false
      )
      and (p_state is null or t.state = p_state)
      and (p_q is null or t.name ilike ('%' || p_q || '%'))
  )
  select
    b.id,
    b.name,
    b.slug,
    b.city,
    b.state,
    b.start_date,
    b.official_website_url,
    b.source_url,
    count(*) over() as total_count
  from base b
  order by b.start_date asc nulls last, b.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.list_missing_venue_link_tournaments(integer, integer, text, text) from public;
grant execute on function public.list_missing_venue_link_tournaments(integer, integer, text, text) to service_role;

-- Admin Dashboard Email tiles RPC: missing venues should count only confirmed venue links.
create or replace function public.get_admin_dashboard_email_tiles(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
as $$
declare
  v_today_start timestamptz;
  v_yesterday_start timestamptz;

  v_canonical_total integer;
  v_canonical_new_yesterday integer;
  v_by_sport jsonb;

  v_missing_venues_total integer;
  v_missing_venues_new_yesterday integer;

  v_owls_eye_venues_total integer;
  v_owls_eye_venues_new_yesterday integer;

  v_qvc_total integer;
  v_qvc_new_yesterday integer;

  v_users_insider_total integer;
  v_users_insider_new_yesterday integer;
  v_users_weekend_total integer;
  v_users_weekend_new_yesterday integer;
begin
  -- UTC day boundaries.
  v_today_start := (date_trunc('day', p_now at time zone 'utc') at time zone 'utc');
  v_yesterday_start := v_today_start - interval '1 day';

  -- Canonical tournaments.
  select count(*)::int into v_canonical_total
  from public.tournaments t
  where t.status = 'published'
    and t.is_canonical = true;

  select count(*)::int into v_canonical_new_yesterday
  from public.tournaments t
  where t.status = 'published'
    and t.is_canonical = true
    and t.created_at >= v_yesterday_start
    and t.created_at < v_today_start;

  select jsonb_agg(
    jsonb_build_object(
      'sport', sport,
      'total', total,
      'new_yesterday', new_yesterday
    )
    order by sport
  )
  into v_by_sport
  from (
    select
      coalesce(nullif(trim(lower(t.sport)), ''), 'unknown') as sport,
      count(*)::int as total,
      count(*) filter (where t.created_at >= v_yesterday_start and t.created_at < v_today_start)::int as new_yesterday
    from public.tournaments t
    where t.status = 'published'
      and t.is_canonical = true
    group by 1
  ) s;

  -- Missing venues (published canonical tournaments with zero CONFIRMED tournament_venues).
  select count(*)::int into v_missing_venues_total
  from public.tournaments t
  where t.status = 'published'
    and t.is_canonical = true
    and not exists (
      select 1
      from public.tournament_venues tv
      where tv.tournament_id = t.id
        and tv.is_inferred = false
    );

  select count(*)::int into v_missing_venues_new_yesterday
  from public.tournaments t
  where t.status = 'published'
    and t.is_canonical = true
    and t.created_at >= v_yesterday_start
    and t.created_at < v_today_start
    and not exists (
      select 1
      from public.tournament_venues tv
      where tv.tournament_id = t.id
        and tv.is_inferred = false
    );

  -- Owl's Eye venue reviews (distinct venues with a completed run).
  select count(distinct r.venue_id)::int into v_owls_eye_venues_total
  from public.owls_eye_runs r
  where r.completed_at is not null
    and r.venue_id is not null;

  select count(distinct r.venue_id)::int into v_owls_eye_venues_new_yesterday
  from public.owls_eye_runs r
  where r.completed_at is not null
    and r.venue_id is not null
    and r.completed_at >= v_yesterday_start
    and r.completed_at < v_today_start;

  -- Venue Check submissions (venue_quick_checks).
  select count(*)::int into v_qvc_total
  from public.venue_quick_checks s;

  select count(*)::int into v_qvc_new_yesterday
  from public.venue_quick_checks s
  where s.created_at >= v_yesterday_start
    and s.created_at < v_today_start;

  -- TI user counts by plan (ti_users).
  -- Insider: anything not weekend_pro (handles null/blank).
  select count(*)::int into v_users_insider_total
  from public.ti_users u
  where coalesce(nullif(trim(lower(u.plan)), ''), 'insider') <> 'weekend_pro';

  select count(*)::int into v_users_insider_new_yesterday
  from public.ti_users u
  where coalesce(nullif(trim(lower(u.plan)), ''), 'insider') <> 'weekend_pro'
    and u.first_seen_at is not null
    and u.first_seen_at >= v_yesterday_start
    and u.first_seen_at < v_today_start;

  select count(*)::int into v_users_weekend_total
  from public.ti_users u
  where trim(lower(coalesce(u.plan, ''))) = 'weekend_pro';

  select count(*)::int into v_users_weekend_new_yesterday
  from public.ti_users u
  where trim(lower(coalesce(u.plan, ''))) = 'weekend_pro'
    and u.first_seen_at is not null
    and u.first_seen_at >= v_yesterday_start
    and u.first_seen_at < v_today_start;

  return jsonb_build_object(
    'window', jsonb_build_object(
      'today_start_utc', v_today_start,
      'yesterday_start_utc', v_yesterday_start
    ),
    'canonical', jsonb_build_object(
      'total', v_canonical_total,
      'new_yesterday', v_canonical_new_yesterday,
      'by_sport', coalesce(v_by_sport, '[]'::jsonb)
    ),
    'missing_venues', jsonb_build_object(
      'total', v_missing_venues_total,
      'new_yesterday', v_missing_venues_new_yesterday
    ),
    'owls_eye', jsonb_build_object(
      'venues_reviewed_total', v_owls_eye_venues_total,
      'venues_reviewed_new_yesterday', v_owls_eye_venues_new_yesterday
    ),
    'venue_check', jsonb_build_object(
      'submissions_total', v_qvc_total,
      'submissions_new_yesterday', v_qvc_new_yesterday
    ),
    'ti_users', jsonb_build_object(
      'insider_total', v_users_insider_total,
      'insider_new_yesterday', v_users_insider_new_yesterday,
      'weekend_pro_total', v_users_weekend_total,
      'weekend_pro_new_yesterday', v_users_weekend_new_yesterday
    )
  );
end $$;

revoke all on function public.get_admin_dashboard_email_tiles(timestamptz) from public;
grant execute on function public.get_admin_dashboard_email_tiles(timestamptz) to service_role;

