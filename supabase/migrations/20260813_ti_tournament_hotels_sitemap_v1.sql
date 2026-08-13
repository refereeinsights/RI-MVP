-- Qualified Tournament Hotels URLs for the dedicated paged sitemap.
-- Keep this predicate aligned with lib/lodging/tournamentHotels.ts.

create or replace function public.get_tournament_hotels_sitemap_page_v1(
  p_limit integer default 500,
  p_offset integer default 0,
  p_now timestamptz default now()
)
returns table (
  slug text,
  updated_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with eligible as materialized (
    select t.slug, t.updated_at
    from public.tournaments t
    where t.status = 'published'
      and nullif(btrim(t.slug), '') is not null
      and nullif(btrim(t.name), '') is not null
      and (nullif(btrim(t.city), '') is not null or nullif(btrim(t.state), '') is not null)
      and t.start_date is not null
      and t.start_date >= (((p_now at time zone 'UTC')::date - interval '1 year')::date)
      and exists (
        select 1
        from public.tournament_venues tv
        join public.venues v on v.id = tv.venue_id
        where tv.tournament_id = t.id
          and tv.is_inferred = false
          and v.latitude is not null
          and v.longitude is not null
          and v.latitude <> 0
          and v.longitude <> 0
          and v.latitude between -90 and 90
          and v.longitude between -180 and 180
      )
  ), counted as (
    select count(*)::bigint as total_count from eligible
  )
  select e.slug, e.updated_at, c.total_count
  from eligible e
  cross join counted c
  order by e.slug asc
  limit greatest(1, least(coalesce(p_limit, 500), 5000))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.get_tournament_hotels_sitemap_page_v1(integer, integer, timestamptz) from public;
revoke all on function public.get_tournament_hotels_sitemap_page_v1(integer, integer, timestamptz) from anon;
revoke all on function public.get_tournament_hotels_sitemap_page_v1(integer, integer, timestamptz) from authenticated;
grant execute on function public.get_tournament_hotels_sitemap_page_v1(integer, integer, timestamptz) to service_role;
