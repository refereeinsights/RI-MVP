-- Admin: seed source recommendations for low-volume states (v1)
-- Helps continuously expand tournament coverage by:
-- - Identifying low-volume states by published canonical tournament count
-- - Showing top `source_domain` per low-volume state
-- - Listing existing "keep" `tournament_sources` rows to use as seed sources
--
-- Notes:
-- - Uses only published canonical tournaments (`tournaments.status='published' and is_canonical=true`)
-- - Intended for admin UI / service role only

create or replace function public.get_admin_tournament_seed_source_recommendations_v1(
  p_sport text default null,
  p_limit int default 12,
  p_low_volume_cutoff int default 30
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      upper(coalesce(nullif(trim(t.state), ''), '')) as state,
      lower(coalesce(nullif(trim(t.sport), ''), 'unknown')) as sport,
      regexp_replace(lower(coalesce(nullif(trim(t.source_domain), ''), '')), '^www\\.', '') as source_domain
    from public.tournaments t
    where t.status = 'published'
      and t.is_canonical = true
      and (p_sport is null or lower(coalesce(nullif(trim(t.sport), ''), 'unknown')) = lower(p_sport))
  ),
  state_counts as (
    select
      b.state,
      count(*)::int as tournament_count,
      count(distinct b.source_domain) filter (where b.source_domain <> '')::int as distinct_source_domains
    from base b
    where b.state <> ''
    group by b.state
  ),
  low_states as (
    select
      sc.state,
      sc.tournament_count,
      sc.distinct_source_domains
    from state_counts sc
    where sc.tournament_count <= greatest(coalesce(p_low_volume_cutoff, 30), 0)
    order by sc.tournament_count asc, sc.state asc
    limit least(greatest(coalesce(p_limit, 12), 1), 50)
  ),
  top_domains as (
    select
      b.state,
      b.source_domain as domain,
      count(*)::int as count,
      row_number() over (partition by b.state order by count(*) desc, b.source_domain asc) as rn
    from base b
    join low_states ls on ls.state = b.state
    where b.source_domain <> ''
    group by b.state, b.source_domain
  ),
  top_domains_by_state as (
    select
      td.state,
      jsonb_agg(
        jsonb_build_object('domain', td.domain, 'count', td.count)
        order by td.count desc, td.domain asc
      ) as domains
    from top_domains td
    where td.rn <= 5
    group by td.state
  ),
  keep_sources as (
    select
      ts.state,
      ts.source_url,
      ts.source_type,
      ts.sport
    from public.tournament_sources ts
    where ts.tournament_id is null
      and ts.is_active = true
      and lower(coalesce(ts.review_status, '')) = 'keep'
      and (p_sport is null or lower(coalesce(ts.sport, '')) = lower(p_sport))
      and (ts.state is null or upper(ts.state) in (select ls.state from low_states ls))
    order by ts.state nulls first, ts.source_url asc
    limit 250
  )
  select jsonb_build_object(
    'sport', p_sport,
    'low_volume_states', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'state', ls.state,
          'tournament_count', ls.tournament_count,
          'distinct_source_domains', ls.distinct_source_domains
        )
        order by ls.tournament_count asc, ls.state asc
      )
      from low_states ls
    ), '[]'::jsonb),
    'top_domains_by_state', coalesce((
      select jsonb_object_agg(t.state, t.domains)
      from top_domains_by_state t
    ), '{}'::jsonb),
    'keep_seed_sources', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'state', ks.state,
          'source_url', ks.source_url,
          'source_type', ks.source_type,
          'sport', ks.sport
        )
        order by ks.state nulls first, ks.source_url asc
      )
      from keep_sources ks
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_admin_tournament_seed_source_recommendations_v1(text, int, int) from public;
grant execute on function public.get_admin_tournament_seed_source_recommendations_v1(text, int, int) to service_role;

