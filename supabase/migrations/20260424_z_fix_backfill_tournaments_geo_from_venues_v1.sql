-- Fix backfill helper function (v1): avoid invalid CTE scoping that caused
-- `relation "candidates" does not exist` at runtime.

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
  v_limit integer := least(greatest(coalesce(p_limit, 2000), 1), 5000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  return query
  with candidates as (
    select t.id
    from public.tournaments t
    where t.latitude is null or t.longitude is null
    order by t.id
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
  ),
  upd as (
    update public.tournaments t
    set
      latitude = coalesce(t.latitude, r.latitude),
      longitude = coalesce(t.longitude, r.longitude),
      geo_source = coalesce(t.geo_source, r.src),
      geo_updated_at = now()
    from ranked r
    where t.id = r.tournament_id
      and (t.latitude is null or t.longitude is null)
    returning 1
  )
  select
    (select count(*)::integer from candidates) as scanned,
    (select count(*)::integer from upd) as updated;
end;
$$;

revoke all on function public.backfill_tournaments_geo_from_venues_v1(integer, integer) from public;
revoke all on function public.backfill_tournaments_geo_from_venues_v1(integer, integer) from anon;
revoke all on function public.backfill_tournaments_geo_from_venues_v1(integer, integer) from authenticated;
grant execute on function public.backfill_tournaments_geo_from_venues_v1(integer, integer) to service_role;

