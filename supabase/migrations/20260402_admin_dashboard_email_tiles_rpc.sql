-- Admin Dashboard Email: tile metrics (canonical deltas, missing venues deltas, Owl's Eye deltas)
-- Delta definition: "new created/reviewed yesterday" (UTC day window).

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
  v_missing_venues_total integer;
  v_missing_venues_new_yesterday integer;
  v_owls_eye_venues_total integer;
  v_owls_eye_venues_new_yesterday integer;
  v_by_sport jsonb;
begin
  -- UTC day boundaries.
  v_today_start := (date_trunc('day', p_now at time zone 'utc') at time zone 'utc');
  v_yesterday_start := v_today_start - interval '1 day';

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

  select count(*)::int into v_missing_venues_total
  from public.tournaments t
  where t.status = 'published'
    and t.is_canonical = true
    and not exists (
      select 1
      from public.tournament_venues tv
      where tv.tournament_id = t.id
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
    );

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
    )
  );
end $$;

revoke all on function public.get_admin_dashboard_email_tiles(timestamptz) from public;
grant execute on function public.get_admin_dashboard_email_tiles(timestamptz) to service_role;

