-- TI admin dashboard email tiles v5: reduce repeated production table scans.
-- The previous PL/pgSQL function issued roughly twenty sequential aggregates and
-- became vulnerable to statement timeout when the cron's other reports fanned out.

create index if not exists owls_eye_runs_completed_venue_reporting_idx
  on public.owls_eye_runs (completed_at, venue_id)
  where completed_at is not null and venue_id is not null;

create or replace function public.get_admin_dashboard_email_tiles(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with
  boundaries as (
    select
      (date_trunc('day', p_now at time zone 'utc') at time zone 'utc') as today_start_utc,
      (date_trunc('day', p_now at time zone 'utc') at time zone 'utc') - interval '1 day' as yesterday_start_utc,
      (p_now at time zone 'utc')::date as today_date_utc,
      (date_trunc('day', p_now at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles') as today_start_pt,
      (date_trunc('day', p_now at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles') - interval '1 day' as yesterday_start_pt,
      (p_now at time zone 'America/Los_Angeles')::date as today_date_pt
  ),
  tournament_rows as materialized (
    select
      t.id,
      t.status,
      t.is_canonical,
      t.created_at,
      t.sport,
      t.is_demo,
      t.start_date,
      t.end_date,
      exists (
        select 1
        from public.tournament_venues tv
        where tv.tournament_id = t.id
      ) as has_venue
    from public.tournaments t
  ),
  tournament_totals as (
    select
      count(id)::int as db_total,
      count(*) filter (
        where status = 'published' and is_canonical = true
      )::int as canonical_total,
      count(id) filter (
        where status = 'published'
          and is_canonical = true
          and created_at >= b.yesterday_start_utc
          and created_at < b.today_start_utc
      )::int as canonical_new_yesterday_utc,
      count(id) filter (
        where status = 'published'
          and is_canonical = true
          and created_at >= b.yesterday_start_pt
          and created_at < b.today_start_pt
      )::int as canonical_new_yesterday_pt,
      count(id) filter (
        where status = 'published'
          and is_canonical = true
          and (coalesce(is_demo, false) = true or start_date >= b.today_date_utc or end_date >= b.today_date_utc)
      )::int as public_total,
      count(id) filter (
        where status = 'published'
          and is_canonical = true
          and created_at >= b.yesterday_start_utc
          and created_at < b.today_start_utc
          and (coalesce(is_demo, false) = true or start_date >= b.today_date_utc or end_date >= b.today_date_utc)
      )::int as public_new_yesterday_utc,
      count(id) filter (
        where status = 'published'
          and is_canonical = true
          and created_at >= b.yesterday_start_pt
          and created_at < b.today_start_pt
          and (coalesce(is_demo, false) = true or start_date >= b.today_date_pt or end_date >= b.today_date_pt)
      )::int as public_new_yesterday_pt,
      count(id) filter (
        where status = 'published' and is_canonical = true and not has_venue
      )::int as missing_venues_total,
      count(id) filter (
        where status = 'published'
          and is_canonical = true
          and not has_venue
          and created_at >= b.yesterday_start_utc
          and created_at < b.today_start_utc
      )::int as missing_venues_new_yesterday_utc,
      count(id) filter (
        where status = 'published'
          and is_canonical = true
          and not has_venue
          and created_at >= b.yesterday_start_pt
          and created_at < b.today_start_pt
      )::int as missing_venues_new_yesterday_pt
    from tournament_rows
    cross join boundaries b
  ),
  canonical_sport_rows as (
    select
      coalesce(nullif(trim(lower(t.sport)), ''), 'unknown') as sport,
      count(*)::int as total,
      count(id) filter (
        where t.created_at >= b.yesterday_start_utc and t.created_at < b.today_start_utc
      )::int as new_yesterday,
      count(*) filter (
        where t.created_at >= b.yesterday_start_pt and t.created_at < b.today_start_pt
      )::int as new_yesterday_pt
    from tournament_rows t
    cross join boundaries b
    where t.status = 'published' and t.is_canonical = true
    group by 1
  ),
  canonical_sports as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'sport', sport,
          'total', total,
          'new_yesterday', new_yesterday,
          'new_yesterday_pt', new_yesterday_pt
        ) order by sport
      ),
      '[]'::jsonb
    ) as rows
    from canonical_sport_rows
  ),
  public_sport_rows as (
    select
      coalesce(nullif(trim(lower(t.sport)), ''), 'unknown') as sport,
      count(*)::int as total,
      count(*) filter (
        where t.created_at >= b.yesterday_start_utc and t.created_at < b.today_start_utc
      )::int as new_yesterday,
      count(*) filter (
        where t.created_at >= b.yesterday_start_pt and t.created_at < b.today_start_pt
      )::int as new_yesterday_pt
    from tournament_rows t
    cross join boundaries b
    where t.status = 'published'
      and t.is_canonical = true
      and (coalesce(t.is_demo, false) = true or t.start_date >= b.today_date_utc or t.end_date >= b.today_date_utc)
    group by 1, b.today_date_utc
  ),
  public_sports as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'sport', sport,
          'total', total,
          'new_yesterday', new_yesterday,
          'new_yesterday_pt', new_yesterday_pt
        ) order by sport
      ),
      '[]'::jsonb
    ) as rows
    from public_sport_rows
  ),
  owls_eye_totals as (
    select
      count(distinct r.venue_id)::int as venues_total,
      count(distinct r.venue_id) filter (
        where r.completed_at >= b.yesterday_start_utc and r.completed_at < b.today_start_utc
      )::int as venues_new_yesterday_utc,
      count(distinct r.venue_id) filter (
        where r.completed_at >= b.yesterday_start_pt and r.completed_at < b.today_start_pt
      )::int as venues_new_yesterday_pt
    from public.owls_eye_runs r
    cross join boundaries b
    where r.completed_at is not null and r.venue_id is not null
  ),
  quick_check_totals as (
    select
      count(*)::int as submissions_total,
      count(*) filter (
        where s.created_at >= b.yesterday_start_utc and s.created_at < b.today_start_utc
      )::int as submissions_new_yesterday_utc,
      count(*) filter (
        where s.created_at >= b.yesterday_start_pt and s.created_at < b.today_start_pt
      )::int as submissions_new_yesterday_pt
    from public.venue_quick_checks s
    cross join boundaries b
  ),
  user_totals as (
    select
      count(*) filter (
        where coalesce(nullif(trim(lower(u.plan)), ''), 'insider') <> 'weekend_pro'
      )::int as insider_total,
      count(*) filter (
        where coalesce(nullif(trim(lower(u.plan)), ''), 'insider') <> 'weekend_pro'
          and u.first_seen_at >= b.yesterday_start_utc
          and u.first_seen_at < b.today_start_utc
      )::int as insider_new_yesterday_utc,
      count(*) filter (
        where coalesce(nullif(trim(lower(u.plan)), ''), 'insider') <> 'weekend_pro'
          and u.first_seen_at >= b.yesterday_start_pt
          and u.first_seen_at < b.today_start_pt
      )::int as insider_new_yesterday_pt,
      count(*) filter (
        where trim(lower(coalesce(u.plan, ''))) = 'weekend_pro'
      )::int as weekend_total,
      count(*) filter (
        where trim(lower(coalesce(u.plan, ''))) = 'weekend_pro'
          and u.first_seen_at >= b.yesterday_start_utc
          and u.first_seen_at < b.today_start_utc
      )::int as weekend_new_yesterday_utc,
      count(*) filter (
        where trim(lower(coalesce(u.plan, ''))) = 'weekend_pro'
          and u.first_seen_at >= b.yesterday_start_pt
          and u.first_seen_at < b.today_start_pt
      )::int as weekend_new_yesterday_pt
    from public.ti_users u
    cross join boundaries b
  )
  select jsonb_build_object(
    'window', jsonb_build_object(
      'today_start_utc', b.today_start_utc,
      'yesterday_start_utc', b.yesterday_start_utc,
      'today_date_utc', b.today_date_utc,
      'today_start_pt', b.today_start_pt,
      'yesterday_start_pt', b.yesterday_start_pt,
      'today_date_pt', b.today_date_pt
    ),
    'tournaments_db', jsonb_build_object('total', t.db_total),
    'canonical', jsonb_build_object(
      'total', t.canonical_total,
      'new_yesterday', t.canonical_new_yesterday_utc,
      'new_yesterday_pt', t.canonical_new_yesterday_pt,
      'by_sport', cs.rows
    ),
    'public_directory', jsonb_build_object(
      'total', t.public_total,
      'new_yesterday', t.public_new_yesterday_utc,
      'new_yesterday_pt', t.public_new_yesterday_pt,
      'by_sport', ps.rows
    ),
    'missing_venues', jsonb_build_object(
      'total', t.missing_venues_total,
      'new_yesterday', t.missing_venues_new_yesterday_utc,
      'new_yesterday_pt', t.missing_venues_new_yesterday_pt
    ),
    'owls_eye', jsonb_build_object(
      'venues_reviewed_total', o.venues_total,
      'venues_reviewed_new_yesterday', o.venues_new_yesterday_utc,
      'venues_reviewed_new_yesterday_pt', o.venues_new_yesterday_pt
    ),
    'venue_check', jsonb_build_object(
      'submissions_total', q.submissions_total,
      'submissions_new_yesterday', q.submissions_new_yesterday_utc,
      'submissions_new_yesterday_pt', q.submissions_new_yesterday_pt
    ),
    'ti_users', jsonb_build_object(
      'insider_total', u.insider_total,
      'insider_new_yesterday', u.insider_new_yesterday_utc,
      'insider_new_yesterday_pt', u.insider_new_yesterday_pt,
      'weekend_pro_total', u.weekend_total,
      'weekend_pro_new_yesterday', u.weekend_new_yesterday_utc,
      'weekend_pro_new_yesterday_pt', u.weekend_new_yesterday_pt
    )
  )
  from boundaries b
  cross join tournament_totals t
  cross join canonical_sports cs
  cross join public_sports ps
  cross join owls_eye_totals o
  cross join quick_check_totals q
  cross join user_totals u;
$function$;

revoke all on function public.get_admin_dashboard_email_tiles(timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_email_tiles(timestamptz)
  to service_role;
