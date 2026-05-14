-- Admin Dashboard Email tiles RPC: add Pacific time (America/Los_Angeles) day windows (v4)
-- Keeps existing UTC fields stable and adds parallel *_pt fields for "yesterday" deltas.

create or replace function public.get_admin_dashboard_email_tiles(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
as $$
declare
  -- UTC window (existing behavior)
  v_today_start_utc timestamptz;
  v_yesterday_start_utc timestamptz;
  v_today_date_utc date;

  -- Pacific window (new)
  v_today_start_pt timestamptz;
  v_yesterday_start_pt timestamptz;
  v_today_date_pt date;

  v_db_total integer;

  v_canonical_total integer;
  v_canonical_new_yesterday_utc integer;
  v_canonical_new_yesterday_pt integer;
  v_by_sport jsonb;

  v_public_total integer;
  v_public_new_yesterday_utc integer;
  v_public_new_yesterday_pt integer;
  v_public_by_sport jsonb;

  v_missing_venues_total integer;
  v_missing_venues_new_yesterday_utc integer;
  v_missing_venues_new_yesterday_pt integer;

  v_owls_eye_venues_total integer;
  v_owls_eye_venues_new_yesterday_utc integer;
  v_owls_eye_venues_new_yesterday_pt integer;

  v_qvc_total integer;
  v_qvc_new_yesterday_utc integer;
  v_qvc_new_yesterday_pt integer;

  v_users_insider_total integer;
  v_users_insider_new_yesterday_utc integer;
  v_users_insider_new_yesterday_pt integer;
  v_users_weekend_total integer;
  v_users_weekend_new_yesterday_utc integer;
  v_users_weekend_new_yesterday_pt integer;
begin
  -- UTC day boundaries (unchanged).
  v_today_start_utc := (date_trunc('day', p_now at time zone 'utc') at time zone 'utc');
  v_yesterday_start_utc := v_today_start_utc - interval '1 day';
  v_today_date_utc := (p_now at time zone 'utc')::date;

  -- Pacific day boundaries.
  v_today_start_pt := (date_trunc('day', p_now at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles');
  v_yesterday_start_pt := v_today_start_pt - interval '1 day';
  v_today_date_pt := (p_now at time zone 'America/Los_Angeles')::date;

  -- Total tournaments in DB (all statuses).
  select count(*)::int into v_db_total
  from public.tournaments t;

  -- Canonical tournaments (all-time published canonical).
  select count(*)::int into v_canonical_total
  from public.tournaments t
  where t.status = 'published'
    and t.is_canonical = true;

  select count(*)::int into v_canonical_new_yesterday_utc
  from public.tournaments t
  where t.status = 'published'
    and t.is_canonical = true
    and t.created_at >= v_yesterday_start_utc
    and t.created_at < v_today_start_utc;

  select count(*)::int into v_canonical_new_yesterday_pt
  from public.tournaments t
  where t.status = 'published'
    and t.is_canonical = true
    and t.created_at >= v_yesterday_start_pt
    and t.created_at < v_today_start_pt;

  select jsonb_agg(
    jsonb_build_object(
      'sport', sport,
      'total', total,
      'new_yesterday', new_yesterday_utc,
      'new_yesterday_pt', new_yesterday_pt
    )
    order by sport
  )
  into v_by_sport
  from (
    select
      coalesce(nullif(trim(lower(t.sport)), ''), 'unknown') as sport,
      count(*)::int as total,
      count(*) filter (where t.created_at >= v_yesterday_start_utc and t.created_at < v_today_start_utc)::int as new_yesterday_utc,
      count(*) filter (where t.created_at >= v_yesterday_start_pt and t.created_at < v_today_start_pt)::int as new_yesterday_pt
    from public.tournaments t
    where t.status = 'published'
      and t.is_canonical = true
    group by 1
  ) s;

  -- Public directory counts (published canonical + upcoming-only unless demo).
  select count(*)::int into v_public_total
  from public.tournaments t
  where t.status = 'published'
    and t.is_canonical = true
    and (
      coalesce(t.is_demo, false) = true
      or t.start_date >= v_today_date_utc
      or t.end_date >= v_today_date_utc
    );

  select count(*)::int into v_public_new_yesterday_utc
  from public.tournaments t
  where t.status = 'published'
    and t.is_canonical = true
    and t.created_at >= v_yesterday_start_utc
    and t.created_at < v_today_start_utc
    and (
      coalesce(t.is_demo, false) = true
      or t.start_date >= v_today_date_utc
      or t.end_date >= v_today_date_utc
    );

  select count(*)::int into v_public_new_yesterday_pt
  from public.tournaments t
  where t.status = 'published'
    and t.is_canonical = true
    and t.created_at >= v_yesterday_start_pt
    and t.created_at < v_today_start_pt
    and (
      coalesce(t.is_demo, false) = true
      or t.start_date >= v_today_date_pt
      or t.end_date >= v_today_date_pt
    );

  select jsonb_agg(
    jsonb_build_object(
      'sport', sport,
      'total', total,
      'new_yesterday', new_yesterday_utc,
      'new_yesterday_pt', new_yesterday_pt
    )
    order by sport
  )
  into v_public_by_sport
  from (
    select
      coalesce(nullif(trim(lower(t.sport)), ''), 'unknown') as sport,
      count(*)::int as total,
      count(*) filter (where t.created_at >= v_yesterday_start_utc and t.created_at < v_today_start_utc)::int as new_yesterday_utc,
      count(*) filter (where t.created_at >= v_yesterday_start_pt and t.created_at < v_today_start_pt)::int as new_yesterday_pt
    from public.tournaments t
    where t.status = 'published'
      and t.is_canonical = true
      and (
        coalesce(t.is_demo, false) = true
        or t.start_date >= v_today_date_utc
        or t.end_date >= v_today_date_utc
      )
    group by 1
  ) s;

  -- Missing venues (published canonical tournaments with zero tournament_venues).
  select count(*)::int into v_missing_venues_total
  from public.tournaments t
  where t.status = 'published'
    and t.is_canonical = true
    and not exists (
      select 1
      from public.tournament_venues tv
      where tv.tournament_id = t.id
    );

  select count(*)::int into v_missing_venues_new_yesterday_utc
  from public.tournaments t
  where t.status = 'published'
    and t.is_canonical = true
    and t.created_at >= v_yesterday_start_utc
    and t.created_at < v_today_start_utc
    and not exists (
      select 1
      from public.tournament_venues tv
      where tv.tournament_id = t.id
    );

  select count(*)::int into v_missing_venues_new_yesterday_pt
  from public.tournaments t
  where t.status = 'published'
    and t.is_canonical = true
    and t.created_at >= v_yesterday_start_pt
    and t.created_at < v_today_start_pt
    and not exists (
      select 1
      from public.tournament_venues tv
      where tv.tournament_id = t.id
    );

  -- Owl's Eye venue reviews (distinct venues with a completed run).
  select count(distinct r.venue_id)::int into v_owls_eye_venues_total
  from public.owls_eye_runs r
  where r.completed_at is not null
    and r.venue_id is not null;

  select count(distinct r.venue_id)::int into v_owls_eye_venues_new_yesterday_utc
  from public.owls_eye_runs r
  where r.completed_at is not null
    and r.venue_id is not null
    and r.completed_at >= v_yesterday_start_utc
    and r.completed_at < v_today_start_utc;

  select count(distinct r.venue_id)::int into v_owls_eye_venues_new_yesterday_pt
  from public.owls_eye_runs r
  where r.completed_at is not null
    and r.venue_id is not null
    and r.completed_at >= v_yesterday_start_pt
    and r.completed_at < v_today_start_pt;

  -- Venue Check submissions (venue_quick_checks).
  select count(*)::int into v_qvc_total
  from public.venue_quick_checks s;

  select count(*)::int into v_qvc_new_yesterday_utc
  from public.venue_quick_checks s
  where s.created_at >= v_yesterday_start_utc
    and s.created_at < v_today_start_utc;

  select count(*)::int into v_qvc_new_yesterday_pt
  from public.venue_quick_checks s
  where s.created_at >= v_yesterday_start_pt
    and s.created_at < v_today_start_pt;

  -- TI user counts by plan (ti_users) using first_seen_at.
  select count(*)::int into v_users_insider_total
  from public.ti_users u
  where coalesce(nullif(trim(lower(u.plan)), ''), 'insider') <> 'weekend_pro';

  select count(*)::int into v_users_insider_new_yesterday_utc
  from public.ti_users u
  where coalesce(nullif(trim(lower(u.plan)), ''), 'insider') <> 'weekend_pro'
    and u.first_seen_at is not null
    and u.first_seen_at >= v_yesterday_start_utc
    and u.first_seen_at < v_today_start_utc;

  select count(*)::int into v_users_insider_new_yesterday_pt
  from public.ti_users u
  where coalesce(nullif(trim(lower(u.plan)), ''), 'insider') <> 'weekend_pro'
    and u.first_seen_at is not null
    and u.first_seen_at >= v_yesterday_start_pt
    and u.first_seen_at < v_today_start_pt;

  select count(*)::int into v_users_weekend_total
  from public.ti_users u
  where trim(lower(coalesce(u.plan, ''))) = 'weekend_pro';

  select count(*)::int into v_users_weekend_new_yesterday_utc
  from public.ti_users u
  where trim(lower(coalesce(u.plan, ''))) = 'weekend_pro'
    and u.first_seen_at is not null
    and u.first_seen_at >= v_yesterday_start_utc
    and u.first_seen_at < v_today_start_utc;

  select count(*)::int into v_users_weekend_new_yesterday_pt
  from public.ti_users u
  where trim(lower(coalesce(u.plan, ''))) = 'weekend_pro'
    and u.first_seen_at is not null
    and u.first_seen_at >= v_yesterday_start_pt
    and u.first_seen_at < v_today_start_pt;

  return jsonb_build_object(
    'window', jsonb_build_object(
      'today_start_utc', v_today_start_utc,
      'yesterday_start_utc', v_yesterday_start_utc,
      'today_date_utc', v_today_date_utc,
      'today_start_pt', v_today_start_pt,
      'yesterday_start_pt', v_yesterday_start_pt,
      'today_date_pt', v_today_date_pt
    ),
    'tournaments_db', jsonb_build_object(
      'total', v_db_total
    ),
    'canonical', jsonb_build_object(
      'total', v_canonical_total,
      'new_yesterday', v_canonical_new_yesterday_utc,
      'new_yesterday_pt', v_canonical_new_yesterday_pt,
      'by_sport', coalesce(v_by_sport, '[]'::jsonb)
    ),
    'public_directory', jsonb_build_object(
      'total', v_public_total,
      'new_yesterday', v_public_new_yesterday_utc,
      'new_yesterday_pt', v_public_new_yesterday_pt,
      'by_sport', coalesce(v_public_by_sport, '[]'::jsonb)
    ),
    'missing_venues', jsonb_build_object(
      'total', v_missing_venues_total,
      'new_yesterday', v_missing_venues_new_yesterday_utc,
      'new_yesterday_pt', v_missing_venues_new_yesterday_pt
    ),
    'owls_eye', jsonb_build_object(
      'venues_reviewed_total', v_owls_eye_venues_total,
      'venues_reviewed_new_yesterday', v_owls_eye_venues_new_yesterday_utc,
      'venues_reviewed_new_yesterday_pt', v_owls_eye_venues_new_yesterday_pt
    ),
    'venue_check', jsonb_build_object(
      'submissions_total', v_qvc_total,
      'submissions_new_yesterday', v_qvc_new_yesterday_utc,
      'submissions_new_yesterday_pt', v_qvc_new_yesterday_pt
    ),
    'ti_users', jsonb_build_object(
      'insider_total', v_users_insider_total,
      'insider_new_yesterday', v_users_insider_new_yesterday_utc,
      'insider_new_yesterday_pt', v_users_insider_new_yesterday_pt,
      'weekend_pro_total', v_users_weekend_total,
      'weekend_pro_new_yesterday', v_users_weekend_new_yesterday_utc,
      'weekend_pro_new_yesterday_pt', v_users_weekend_new_yesterday_pt
    )
  );
end $$;

revoke all on function public.get_admin_dashboard_email_tiles(timestamptz) from public;
grant execute on function public.get_admin_dashboard_email_tiles(timestamptz) to service_role;

