-- SEO city metro hubs (v1)
-- Data-driven metro hub candidates + seeding top 25 city-based metro_markets using metro_market_city_rules.
--
-- Goal: enable high-quality sport+state+metro hub pages like /soccer/washington/seattle-wa
-- without auto-generating thin pages.
--
-- Safe to rerun:
-- - creates RPCs if missing
-- - upserts metro_markets by slug
-- - inserts city rules/states with ON CONFLICT DO NOTHING

do $$
begin
  -- Ensure base metro tables exist (some environments may not have applied earlier migrations yet).
  if to_regclass('public.metro_markets') is null or to_regclass('public.metro_market_states') is null then
    return;
  end if;

  -- Ensure city rules table exists.
  create table if not exists public.metro_market_city_rules (
    id uuid primary key default gen_random_uuid(),
    metro_market_id uuid not null references public.metro_markets (id) on delete cascade,
    state text not null,
    city text not null,
    created_at timestamptz not null default now(),
    constraint metro_market_city_rules_unique unique (metro_market_id, state, city)
  );

  create index if not exists metro_market_city_rules_metro_market_id_idx
    on public.metro_market_city_rules (metro_market_id);
  create index if not exists metro_market_city_rules_state_idx
    on public.metro_market_city_rules (state);
  create index if not exists metro_market_city_rules_city_idx
    on public.metro_market_city_rules (city);

  alter table public.metro_market_city_rules enable row level security;
  revoke all on table public.metro_market_city_rules from public, anon, authenticated;
  grant select, insert, update, delete on table public.metro_market_city_rules to service_role;
end $$;

create or replace function public.get_city_metro_hub_candidates_v1(
  p_limit integer default 250,
  p_now timestamptz default now()
)
returns table(
  state text,
  city text,
  metro_slug text,
  metro_name text,
  tournament_count integer,
  upcoming_tournament_count integer,
  venue_count integer,
  organizer_domain_count integer,
  sports_supported integer,
  unique_months_with_tournaments integer,
  seo_priority_score double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select (p_now at time zone 'utc')::date as today_utc
  ),
  base as (
    select
      upper(trim(tp.state)) as state,
      trim(tp.city) as city,
      lower(trim(coalesce(tp.sport, ''))) as sport,
      tp.id as tournament_id,
      tp.start_date,
      tp.end_date,
      tp.updated_at,
      coalesce(tp.is_demo, false) as is_demo,
      coalesce(tp.official_website_url, tp.source_url, '') as best_url
    from public.tournaments_public tp
    join params p on true
    where tp.state is not null
      and length(trim(tp.state)) = 2
      and tp.city is not null
      and length(trim(tp.city)) > 0
  ),
  with_upcoming as (
    select
      b.*,
      (b.is_demo = true or b.start_date >= p.today_utc or b.end_date >= p.today_utc) as is_upcoming
    from base b
    join params p on true
  ),
  venue_links as (
    select
      tv.tournament_id,
      count(distinct tv.venue_id)::int as venue_count
    from public.tournament_venues tv
    where tv.is_inferred = false
    group by 1
  ),
  enriched as (
    select
      w.state,
      w.city,
      w.sport,
      w.tournament_id,
      w.start_date,
      w.updated_at,
      w.is_upcoming,
      coalesce(vl.venue_count, 0) as venue_count,
      lower(regexp_replace(split_part(regexp_replace(w.best_url, '^https?://', ''), '/', 1), '^www\\.', '')) as organizer_domain
    from with_upcoming w
    left join venue_links vl on vl.tournament_id = w.tournament_id
  ),
  agg as (
    select
      e.state,
      e.city,
      count(*)::int as tournament_count,
      count(*) filter (where e.is_upcoming)::int as upcoming_tournament_count,
      count(distinct e.tournament_id) filter (where e.is_upcoming)::int as upcoming_distinct_tournaments,
      count(distinct e.organizer_domain) filter (where e.is_upcoming and e.organizer_domain <> '')::int as organizer_domain_count,
      count(distinct tv.venue_id) filter (where e.is_upcoming)::int as venue_count,
      count(distinct nullif(e.sport, '')) filter (where e.is_upcoming)::int as sports_supported,
      count(distinct to_char(e.start_date, 'YYYY-MM')) filter (where e.is_upcoming and e.start_date is not null)::int as unique_months_with_tournaments
    from enriched e
    left join public.tournament_venues tv
      on tv.tournament_id = e.tournament_id and tv.is_inferred = false
    group by 1,2
  )
  select
    a.state,
    a.city,
    -- deterministic slug: <city>-<state> (lowercase)
    (trim(both '-' from regexp_replace(lower(a.city), '[^a-z0-9]+', '-', 'g')) || '-' || lower(a.state)) as metro_slug,
    (a.city || ' (' || upper(a.state) || ')') as metro_name,
    a.tournament_count,
    a.upcoming_tournament_count,
    a.venue_count,
    a.organizer_domain_count,
    a.sports_supported,
    a.unique_months_with_tournaments,
    (
      3*ln(1 + greatest(a.upcoming_tournament_count, 0)) +
      2*ln(1 + greatest(a.venue_count, 0)) +
      2*ln(1 + greatest(a.organizer_domain_count, 0)) +
      1.5*greatest(a.unique_months_with_tournaments, 0) +
      1*greatest(a.sports_supported, 0)
    ) as seo_priority_score
  from agg a
  where a.upcoming_tournament_count >= 5
  order by seo_priority_score desc, a.upcoming_tournament_count desc, a.state asc, a.city asc
  limit least(greatest(coalesce(p_limit, 250), 1), 2000);
$$;

revoke all on function public.get_city_metro_hub_candidates_v1(integer, timestamptz) from public;
grant execute on function public.get_city_metro_hub_candidates_v1(integer, timestamptz) to service_role;

-- Seed top 25 candidates as city-based metro markets (idempotent).
do $$
declare
  r record;
  v_market_id uuid;
begin
  if to_regclass('public.metro_markets') is null or to_regclass('public.metro_market_states') is null then
    return;
  end if;

  for r in
    select *
    from public.get_city_metro_hub_candidates_v1(25, now())
  loop
    insert into public.metro_markets (name, slug)
    values (r.metro_name, r.metro_slug)
    on conflict (slug) do update
    set name = excluded.name
    returning id into v_market_id;

    if v_market_id is null then
      select id into v_market_id from public.metro_markets where slug = r.metro_slug;
    end if;

    if v_market_id is null then
      continue;
    end if;

    insert into public.metro_market_states (metro_market_id, state)
    values (v_market_id, upper(r.state))
    on conflict (metro_market_id, state) do nothing;

    insert into public.metro_market_city_rules (metro_market_id, state, city)
    values (v_market_id, upper(r.state), r.city)
    on conflict (metro_market_id, state, city) do nothing;
  end loop;
end $$;

-- Indexable metro hub URLs for sitemap generation (city-rule-based, single-state markets only).
create or replace function public.list_indexable_city_metro_hub_urls_v1(
  p_min_upcoming integer default 12,
  p_now timestamptz default now()
)
returns table(
  sport text,
  state text,
  metro_slug text,
  upcoming_tournament_count integer,
  last_modified timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      (p_now at time zone 'utc')::date as today_utc,
      least(greatest(coalesce(p_min_upcoming, 12), 1), 2000) as min_upcoming
  ),
  markets as (
    select
      mm.id,
      mm.slug,
      mms.state
    from public.metro_markets mm
    join public.metro_market_states mms on mms.metro_market_id = mm.id
    join params p on true
    where mms.state is not null
      and length(trim(mms.state)) = 2
  ),
  single_state_markets as (
    select m.*
    from markets m
    where not exists (
      select 1
      from public.metro_market_states other
      where other.metro_market_id = m.id
        and upper(trim(other.state)) <> upper(trim(m.state))
    )
  ),
  rules as (
    select
      s.id as metro_market_id,
      s.slug as metro_slug,
      upper(trim(s.state)) as state,
      lower(trim(r.city)) as city_norm
    from single_state_markets s
    join public.metro_market_city_rules r on r.metro_market_id = s.id
    where upper(trim(r.state)) = upper(trim(s.state))
  ),
  joined as (
    select
      lower(trim(tp.sport)) as sport,
      upper(trim(tp.state)) as state,
      ru.metro_slug,
      tp.id as tournament_id,
      tp.updated_at,
      coalesce(tp.is_demo, false) as is_demo,
      tp.start_date,
      tp.end_date
    from rules ru
    join public.tournaments_public tp
      on upper(trim(tp.state)) = ru.state
     and lower(trim(coalesce(tp.city, ''))) = ru.city_norm
  ),
  scoped as (
    select
      j.*,
      (j.is_demo = true or j.start_date >= p.today_utc or j.end_date >= p.today_utc) as is_upcoming
    from joined j
    join params p on true
  )
  select
    s.sport,
    s.state,
    s.metro_slug,
    count(distinct s.tournament_id) filter (where s.is_upcoming)::int as upcoming_tournament_count,
    max(s.updated_at) as last_modified
  from scoped s
  group by 1,2,3
  having count(distinct s.tournament_id) filter (where s.is_upcoming) >= (select min_upcoming from params)
  order by upcoming_tournament_count desc, state asc, sport asc, metro_slug asc;
$$;

revoke all on function public.list_indexable_city_metro_hub_urls_v1(integer, timestamptz) from public;
grant execute on function public.list_indexable_city_metro_hub_urls_v1(integer, timestamptz) to service_role;

