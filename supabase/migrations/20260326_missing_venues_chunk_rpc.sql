-- Missing venues chunking helper.
-- Moving-forward source of truth: tournaments missing linked venues in `public.tournament_venues`.
-- Provides a single RPC to page through the list without client-side NOT EXISTS emulation.

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
      and not exists (
        select 1
        from public.tournament_venues tv
        where tv.tournament_id = t.id
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

