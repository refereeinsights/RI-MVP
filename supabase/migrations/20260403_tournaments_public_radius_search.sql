-- Tournaments directory: radius search by venue coordinates (v1)
-- Adds an RPC used by TI tournament directory to filter tournaments within a radius
-- of a user-provided ZIP code (center geocoded in the app). This approach:
-- - Does not require tournament lat/lng columns
-- - Uses CONFIRMED venue links only (tournament_venues.is_inferred=false)
-- - Computes tournament distance as the minimum distance of any linked venue

create or replace function public.list_tournaments_public_within_radius_v1(
  p_center_lat double precision,
  p_center_lng double precision,
  p_radius_miles double precision default 50,
  p_limit integer default 1000,
  p_offset integer default 0,
  p_today date default current_date,
  p_include_past boolean default false,
  p_q text default null,
  p_start_date_gte date default null,
  p_start_date_lt date default null,
  p_ayso_only boolean default false
)
returns table (
  id uuid,
  name text,
  slug text,
  sport text,
  tournament_association text,
  state text,
  city text,
  zip text,
  start_date date,
  end_date date,
  official_website_url text,
  source_url text,
  level text,
  tournament_staff_verified boolean,
  is_demo boolean,
  distance_miles double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      p_center_lat as center_lat,
      p_center_lng as center_lng,
      least(greatest(coalesce(p_radius_miles, 50), 1), 500) as radius_miles,
      least(greatest(coalesce(p_limit, 1000), 1), 5000) as lim,
      greatest(coalesce(p_offset, 0), 0) as off,
      coalesce(p_today, current_date) as today,
      coalesce(p_include_past, false) as include_past,
      nullif(trim(p_q), '') as q,
      p_start_date_gte as start_gte,
      p_start_date_lt as start_lt,
      coalesce(p_ayso_only, false) as ayso_only
  ),
  base as (
    select
      tp.id,
      tp.name,
      tp.slug,
      tp.sport,
      tp.tournament_association,
      tp.state,
      tp.city,
      tp.zip,
      tp.start_date,
      tp.end_date,
      tp.official_website_url,
      tp.source_url,
      tp.level,
      tp.tournament_staff_verified,
      tp.is_demo,
      v.latitude as venue_lat,
      v.longitude as venue_lng
    from public.tournaments_public tp
    join public.tournament_venues tv
      on tv.tournament_id = tp.id
     and tv.is_inferred = false
    join public.venues v
      on v.id = tv.venue_id
    join params p on true
    where v.latitude is not null
      and v.longitude is not null
      and (
        p.include_past
        or coalesce(tp.is_demo, false) = true
        or tp.start_date >= p.today
        or tp.end_date >= p.today
      )
      and (
        p.q is null
        or tp.name ilike ('%' || p.q || '%')
        or tp.city ilike ('%' || p.q || '%')
      )
      and (p.start_gte is null or tp.start_date >= p.start_gte)
      and (p.start_lt is null or tp.start_date < p.start_lt)
      and (
        case
          when p.ayso_only = true then upper(coalesce(tp.tournament_association, '')) = 'AYSO'
          else upper(coalesce(tp.tournament_association, '')) <> 'AYSO'
        end
      )
  ),
  scored as (
    select
      b.*,
      (
        3958.7613 * 2 * asin(
          sqrt(
            power(sin(radians((b.venue_lat - p.center_lat) / 2)), 2)
            + cos(radians(p.center_lat))
              * cos(radians(b.venue_lat))
              * power(sin(radians((b.venue_lng - p.center_lng) / 2)), 2)
          )
        )
      ) as distance_miles
    from base b
    join params p on true
  ),
  grouped as (
    select
      s.id,
      s.name,
      s.slug,
      s.sport,
      s.tournament_association,
      s.state,
      s.city,
      s.zip,
      s.start_date,
      s.end_date,
      s.official_website_url,
      s.source_url,
      s.level,
      s.tournament_staff_verified,
      s.is_demo,
      min(s.distance_miles) as distance_miles
    from scored s
    group by
      s.id,
      s.name,
      s.slug,
      s.sport,
      s.tournament_association,
      s.state,
      s.city,
      s.zip,
      s.start_date,
      s.end_date,
      s.official_website_url,
      s.source_url,
      s.level,
      s.tournament_staff_verified,
      s.is_demo
  )
  select
    g.*
  from grouped g
  join params p on true
  where g.distance_miles <= p.radius_miles
  order by g.distance_miles asc, g.start_date asc nulls last, g.id asc
  limit (select lim from params)
  offset (select off from params);
$$;

revoke all on function public.list_tournaments_public_within_radius_v1(
  double precision,
  double precision,
  double precision,
  integer,
  integer,
  date,
  boolean,
  text,
  date,
  date,
  boolean
) from public;
grant execute on function public.list_tournaments_public_within_radius_v1(
  double precision,
  double precision,
  double precision,
  integer,
  integer,
  date,
  boolean,
  text,
  date,
  date,
  boolean
) to service_role;

