-- TI: outbound click analytics RPCs (extend) (v2)
-- Admin tooling helpers for reporting on hotel (Booking) outbound clicks.
-- Safe to rerun; functions are replaced in-place.

do $$
begin
  if to_regclass('public.ti_outbound_clicks') is null or to_regclass('public.venues') is null then
    return;
  end if;

  -- Require the hotels extensions columns to exist.
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ti_outbound_clicks'
      and column_name in ('destination_type', 'venue_id')
    group by table_schema, table_name
    having count(*) = 2
  ) then
    return;
  end if;

  -- Top venues by hotel click volume, with optional search + state filter.
  execute $fn$
    create or replace function public.list_ti_outbound_clicks_hotels_top_venues_v1(
      p_limit integer default 25,
      p_offset integer default 0,
      p_q text default null,
      p_state text default null
    )
    returns table (
      venue_id uuid,
      venue_name text,
      city text,
      state text,
      click_count integer,
      last_clicked_at timestamptz,
      total_count bigint
    )
    language sql
    stable
    security definer
    set search_path = public
    as $body$
      with agg as (
        select
          c.venue_id,
          count(*)::int as click_count,
          max(c.created_at) as last_clicked_at
        from public.ti_outbound_clicks c
        where c.destination_type = 'hotels'
          and c.venue_id is not null
        group by 1
      ),
      joined as (
        select
          a.venue_id,
          v.name as venue_name,
          v.city as city,
          upper(trim(v.state)) as state,
          a.click_count,
          a.last_clicked_at
        from agg a
        join public.venues v on v.id = a.venue_id
        where (p_state is null or upper(trim(v.state)) = upper(trim(p_state)))
          and (
            p_q is null
            or v.name ilike ('%' || p_q || '%')
            or v.city ilike ('%' || p_q || '%')
          )
      )
      select
        j.venue_id,
        j.venue_name,
        j.city,
        j.state,
        j.click_count,
        j.last_clicked_at,
        count(*) over() as total_count
      from joined j
      order by j.click_count desc, j.last_clicked_at desc nulls last, j.venue_name asc
      limit least(greatest(coalesce(p_limit, 25), 1), 200)
      offset greatest(coalesce(p_offset, 0), 0);
    $body$;
  $fn$;

  execute $fn$
    revoke all on function public.list_ti_outbound_clicks_hotels_top_venues_v1(integer, integer, text, text) from public;
    grant execute on function public.list_ti_outbound_clicks_hotels_top_venues_v1(integer, integer, text, text) to service_role;
  $fn$;
end $$;

