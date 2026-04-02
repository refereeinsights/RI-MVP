-- Admin tournament acquisition tiles
-- Aggregates acquisition signals from published canonical tournaments:
-- - Top `source_domain`
-- - Top `official_website_url` domain
-- - Top `tournament_association`
-- - Top `source_domain` per sport (top 3 each)
--
-- Notes:
-- - Domains are normalized to lowercase and strip leading `www.`
-- - Read-only and service-role-only (admin UI calls via supabaseAdmin)

create or replace function public.get_admin_tournament_acquisition_tiles(p_limit int default 8)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      lower(coalesce(nullif(trim(t.sport), ''), 'unknown')) as sport,
      regexp_replace(lower(coalesce(nullif(trim(t.source_domain), ''), '')), '^www\\.', '') as source_domain,
      trim(coalesce(t.tournament_association, '')) as tournament_association,
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(nullif(trim(t.official_website_url), ''), '')), '^https?://', ''),
          '/.*$',
          ''
        ),
        '^www\\.',
        ''
      ) as official_domain
    from public.tournaments t
    where t.status = 'published'
      and t.is_canonical = true
  ),
  source_domains as (
    select source_domain as domain, count(*)::int as count
    from base
    where source_domain <> ''
    group by 1
    order by count desc, domain asc
    limit p_limit
  ),
  official_domains as (
    select official_domain as domain, count(*)::int as count
    from base
    where official_domain <> ''
    group by 1
    order by count desc, domain asc
    limit p_limit
  ),
  associations as (
    select tournament_association as association, count(*)::int as count
    from base
    where tournament_association <> ''
    group by 1
    order by count desc, association asc
    limit p_limit
  ),
  by_sport_domain as (
    select
      sport,
      source_domain as domain,
      count(*)::int as count,
      row_number() over (partition by sport order by count(*) desc, source_domain asc) as rn
    from base
    where source_domain <> ''
    group by sport, source_domain
  ),
  top_domains_by_sport as (
    select sport, domain, count
    from by_sport_domain
    where rn <= 3
    order by sport asc, count desc, domain asc
  )
  select jsonb_build_object(
    'source_domains', coalesce((
      select jsonb_agg(jsonb_build_object('domain', d.domain, 'count', d.count) order by d.count desc, d.domain asc)
      from source_domains d
    ), '[]'::jsonb),
    'official_domains', coalesce((
      select jsonb_agg(jsonb_build_object('domain', d.domain, 'count', d.count) order by d.count desc, d.domain asc)
      from official_domains d
    ), '[]'::jsonb),
    'associations', coalesce((
      select jsonb_agg(jsonb_build_object('association', a.association, 'count', a.count) order by a.count desc, a.association asc)
      from associations a
    ), '[]'::jsonb),
    'top_domains_by_sport', coalesce((
      select jsonb_agg(jsonb_build_object('sport', t.sport, 'domain', t.domain, 'count', t.count) order by t.sport asc, t.count desc, t.domain asc)
      from top_domains_by_sport t
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_admin_tournament_acquisition_tiles(int) from public;
grant execute on function public.get_admin_tournament_acquisition_tiles(int) to service_role;
