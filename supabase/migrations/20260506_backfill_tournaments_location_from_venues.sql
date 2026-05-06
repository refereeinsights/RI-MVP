-- One-time backfill: copy lat/lng + city/state/zip from confirmed/primary linked
-- venues to tournaments that currently have no coordinates.
--
-- Preference order: is_primary DESC, created_at ASC (same as v1 geo function).
-- city/state/zip: null-only (coalesce) — existing CSV-sourced values are preserved.
-- lat/lng: always set from venue (these rows already have null coords by filter).
--
-- To swap to venue-wins for city/state/zip too, replace the three coalesce()
-- lines with bare `r.city`, `r.state`, `r.zip`.

with ranked as (
  select distinct on (tv.tournament_id)
    tv.tournament_id,
    v.latitude,
    v.longitude,
    v.city      as venue_city,
    v.state     as venue_state,
    v.zip       as venue_zip,
    case
      when coalesce(tv.is_primary, false) = true then 'primary_venue_location_backfill_v1'
      else 'confirmed_venue_location_backfill_v1'
    end as geo_src
  from public.tournaments t
  join public.tournament_venues tv
    on tv.tournament_id = t.id
   and tv.is_inferred = false
  join public.venues v
    on v.id = tv.venue_id
   and v.latitude  is not null
   and v.longitude is not null
  where t.latitude  is null
     or t.longitude is null
  order by tv.tournament_id,
           tv.is_primary desc nulls last,
           tv.created_at asc
)
update public.tournaments t
set
  latitude       = r.latitude,
  longitude      = r.longitude,
  geo_source     = r.geo_src,
  geo_updated_at = now(),
  city           = coalesce(t.city,  r.venue_city),
  state          = coalesce(t.state, r.venue_state),
  zip            = coalesce(t.zip,   r.venue_zip)
from ranked r
where t.id = r.tournament_id
  and (t.latitude is null or t.longitude is null);
