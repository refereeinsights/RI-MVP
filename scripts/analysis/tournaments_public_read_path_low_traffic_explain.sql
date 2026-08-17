-- LOW-TRAFFIC OR STAGING ONLY
--
-- These statements execute the SELECT plans. Do not run this file during an
-- active saturation event. The read-only transaction, statement timeout, and
-- lock timeout limit risk; if a query times out, do not repeatedly rerun it.

begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';

explain (analyze, buffers, settings, format text)
select name, city, state, start_date, end_date, slug, sport
from public.tournaments_public
where slug = 'heartland-midwest-classic-2026-overland-park-ks';

explain (analyze, buffers, settings, format text)
select
  id,
  slug,
  name,
  city,
  state,
  zip,
  latitude,
  longitude,
  start_date,
  end_date,
  summary,
  source_url,
  official_website_url,
  sport,
  level,
  tournament_staff_verified,
  venue,
  address,
  static_map_path,
  static_map_status,
  static_map_updated_at
from public.tournaments_public
where slug = 'heartland-midwest-classic-2026-overland-park-ks';

explain (analyze, buffers, settings, format text)
select
  tp.id,
  tp.name,
  tp.slug,
  tp.sport,
  tp.state,
  tp.city,
  tp.start_date,
  tp.end_date,
  (
    select count(*)
    from public.tournament_venues tv
    where tv.tournament_id = tp.id
  ) as venue_count
from public.tournaments_public tp
where (coalesce(tp.is_demo, false) = true or tp.start_date >= current_date or tp.end_date >= current_date)
  and tp.name not ilike '%league%'
order by tp.is_demo desc, tp.start_date asc nulls last, tp.id asc
limit 51;

explain (analyze, buffers, settings, format text)
select id, name, slug, sport, state, city, start_date, end_date
from public.tournaments_public
where state = 'CA'
  and sport = 'soccer'
  and (start_date >= current_date or end_date >= current_date)
order by start_date asc nulls last, id asc
limit 51;

rollback;
