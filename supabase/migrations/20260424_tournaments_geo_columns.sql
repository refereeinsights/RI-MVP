-- Tournaments geo columns (lat/lng) + public surface + backfill helper (v1)
--
-- Motivation:
-- - TI tournament pages and planning surfaces can benefit from a stable tournament-level
--   coordinate when venues are known (especially primary venue).
-- - Backfill is deterministic from confirmed venue links; optional geocoding can be done
--   in ops scripts for tournaments without venue geo.

alter table public.tournaments
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geo_source text,
  add column if not exists geo_updated_at timestamptz;

create index if not exists tournaments_lat_lng_present_idx
  on public.tournaments (latitude, longitude)
  where latitude is not null and longitude is not null;

-- Recreate tournaments_public with the new geo fields (keeps stable column surface).
drop view if exists public.tournaments_public;

create or replace view public.tournaments_public
with (security_invoker = true) as
select
  id,
  slug,
  name,
  sport,
  tournament_association,
  level,
  state,
  city,
  zip,
  start_date,
  end_date,
  source_url,
  official_website_url,
  summary,
  referee_contact,
  tournament_director,
  venue,
  address,
  updated_at,
  tournament_staff_verified,
  is_demo,
  latitude,
  longitude,
  geo_source,
  geo_updated_at
from public.tournaments
where status = 'published'
  and is_canonical = true;

revoke all on table public.tournaments_public from public;
revoke all on table public.tournaments_public from anon;
revoke all on table public.tournaments_public from authenticated;
grant select on table public.tournaments_public to service_role;

-- Deterministic backfill helper: set tournament lat/lng from confirmed linked venues.
-- Preference order: primary venue first, then earliest confirmed venue link.
create or replace function public.backfill_tournaments_geo_from_venues_v1(
  p_limit integer default 2000,
  p_offset integer default 0
)
returns table (
  scanned integer,
  updated integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scanned integer := 0;
  v_updated integer := 0;
  v_limit integer := least(greatest(coalesce(p_limit, 2000), 1), 5000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  with candidates as (
    select t.id
    from public.tournaments t
    where t.latitude is null or t.longitude is null
    order by t.updated_at desc nulls last, t.id
    limit v_limit
    offset v_offset
  ),
  ranked as (
    select distinct on (tv.tournament_id)
      tv.tournament_id,
      v.latitude,
      v.longitude,
      case
        when coalesce(tv.is_primary, false) = true then 'primary_venue_backfill_v1'
        else 'confirmed_venue_backfill_v1'
      end as src
    from candidates c
    join public.tournament_venues tv
      on tv.tournament_id = c.id
     and tv.is_inferred = false
    join public.venues v
      on v.id = tv.venue_id
    where v.latitude is not null
      and v.longitude is not null
    order by tv.tournament_id, tv.is_primary desc nulls last, tv.created_at asc
  )
  update public.tournaments t
  set
    latitude = coalesce(t.latitude, r.latitude),
    longitude = coalesce(t.longitude, r.longitude),
    geo_source = coalesce(t.geo_source, r.src),
    geo_updated_at = now()
  from ranked r
  where t.id = r.tournament_id
    and (t.latitude is null or t.longitude is null);

  get diagnostics v_updated = row_count;
  select count(*) into v_scanned from candidates;

  return query select v_scanned, v_updated;
end;
$$;

revoke all on function public.backfill_tournaments_geo_from_venues_v1(integer, integer) from public;
revoke all on function public.backfill_tournaments_geo_from_venues_v1(integer, integer) from anon;
revoke all on function public.backfill_tournaments_geo_from_venues_v1(integer, integer) from authenticated;
grant execute on function public.backfill_tournaments_geo_from_venues_v1(integer, integer) to service_role;

