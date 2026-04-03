-- Missing venues: optional ZIP filter (v1)
-- Extends list_missing_venue_link_tournaments_v2 with an optional ZIP constraint.
-- ZIP is normalized to 5 digits and matched against tournaments.zip (also normalized).

do $$
begin
  -- Prevent PostgREST ambiguity from overloaded signatures.
  drop function if exists public.list_missing_venue_link_tournaments_v2(integer, integer, text, text, text);
end $$;

create or replace function public.list_missing_venue_link_tournaments_v2(
  p_limit integer default 50,
  p_offset integer default 0,
  p_state text default null,
  p_q text default null,
  p_zip text default null,
  p_status text default 'published'
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
  status text,
  is_canonical boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      case when lower(coalesce(p_status, 'published')) = 'draft' then 'draft' else 'published' end as status,
      nullif(regexp_replace(coalesce(p_zip, ''), '[^0-9]+', '', 'g'), '') as zip_digits
  ),
  base as (
    select
      t.id,
      t.name,
      t.slug,
      t.city,
      t.state,
      t.start_date,
      t.official_website_url,
      t.source_url,
      t.status,
      t.is_canonical,
      t.created_at
    from public.tournaments t
    join params p on true
    where t.status = p.status
      and (p.status = 'draft' or t.is_canonical = true)
      and coalesce(t.skip_venue_discovery, false) = false
      and not exists (
        select 1
        from public.tournament_venues tv
        where tv.tournament_id = t.id
          and tv.is_inferred = false
      )
      and (p_state is null or t.state = p_state)
      and (p_q is null or t.name ilike ('%' || p_q || '%'))
      and (
        p.zip_digits is null
        or left(regexp_replace(coalesce(t.zip, ''), '[^0-9]+', '', 'g'), 5) = left(p.zip_digits, 5)
      )
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
    b.status,
    b.is_canonical,
    count(*) over() as total_count
  from base b
  order by b.start_date asc nulls last, b.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.list_missing_venue_link_tournaments_v2(integer, integer, text, text, text, text) from public;
grant execute on function public.list_missing_venue_link_tournaments_v2(integer, integer, text, text, text, text) to service_role;

