-- TI: outbound click analytics RPCs (v1)
-- Admin tooling helpers for reporting on official-site outbound clicks.
-- Safe to rerun; functions are replaced in-place.

do $$
begin
  if to_regclass('public.ti_outbound_clicks') is null or to_regclass('public.tournaments') is null then
    return;
  end if;

  -- Click counts by sport (optional state filter).
  execute $fn$
    create or replace function public.list_ti_outbound_clicks_sport_counts_v1(
      p_state text default null
    )
    returns table (
      sport text,
      click_count bigint
    )
    language sql
    stable
    security definer
    set search_path = public
    as $$
      select
        lower(trim(t.sport)) as sport,
        count(*)::bigint as click_count
      from public.ti_outbound_clicks c
      join public.tournaments t on t.id = c.tournament_id
      where t.sport is not null
        and length(trim(t.sport)) > 0
        and (p_state is null or upper(trim(t.state)) = upper(trim(p_state)))
      group by 1
      order by click_count desc, sport asc;
    $$;
  $fn$;

  execute $fn$
    revoke all on function public.list_ti_outbound_clicks_sport_counts_v1(text) from public;
    grant execute on function public.list_ti_outbound_clicks_sport_counts_v1(text) to service_role;
  $fn$;

  -- Top tournaments by click volume, with search + filters.
  execute $fn$
    create or replace function public.list_ti_outbound_clicks_top_tournaments_v1(
      p_limit integer default 50,
      p_offset integer default 0,
      p_q text default null,
      p_state text default null,
      p_sport text default null
    )
    returns table (
      tournament_id uuid,
      tournament_slug text,
      tournament_name text,
      state text,
      sport text,
      click_count integer,
      last_clicked_at timestamptz,
      total_count bigint
    )
    language sql
    stable
    security definer
    set search_path = public
    as $$
      with agg as (
        select
          c.tournament_id,
          count(*)::int as click_count,
          max(c.created_at) as last_clicked_at
        from public.ti_outbound_clicks c
        group by 1
      ),
      joined as (
        select
          a.tournament_id,
          t.slug as tournament_slug,
          t.name as tournament_name,
          upper(trim(t.state)) as state,
          lower(trim(t.sport)) as sport,
          a.click_count,
          a.last_clicked_at
        from agg a
        join public.tournaments t on t.id = a.tournament_id
        where (p_state is null or upper(trim(t.state)) = upper(trim(p_state)))
          and (p_sport is null or lower(trim(t.sport)) = lower(trim(p_sport)))
          and (
            p_q is null
            or t.name ilike ('%' || p_q || '%')
            or t.slug ilike ('%' || p_q || '%')
          )
      )
      select
        j.tournament_id,
        j.tournament_slug,
        j.tournament_name,
        j.state,
        j.sport,
        j.click_count,
        j.last_clicked_at,
        count(*) over() as total_count
      from joined j
      order by j.click_count desc, j.last_clicked_at desc nulls last, j.tournament_name asc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
      offset greatest(coalesce(p_offset, 0), 0);
    $$;
  $fn$;

  execute $fn$
    revoke all on function public.list_ti_outbound_clicks_top_tournaments_v1(integer, integer, text, text, text) from public;
    grant execute on function public.list_ti_outbound_clicks_top_tournaments_v1(integer, integer, text, text, text) to service_role;
  $fn$;
end $$;

