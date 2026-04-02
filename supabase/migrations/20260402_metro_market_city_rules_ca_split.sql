-- Metro market city rules (California split)
-- Adds deterministic city-based rules for overlapping California metro markets.
-- Service-role-only (matches metro_markets access pattern).

do $$
begin
  if to_regclass('public.metro_markets') is null then
    -- Base metro tables not installed in this env yet.
    return;
  end if;

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

  -- Seed (idempotent). City strings are stored in canonical display form; matching is done case-insensitively in queries.
  with markets as (
    select id, slug
    from public.metro_markets
    where slug in ('southern-california', 'northern-california')
  ),
  desired as (
    -- Southern California
    select (select id from markets where slug = 'southern-california') as metro_market_id, 'CA'::text as state, unnest(array[
      'Los Angeles',
      'Anaheim',
      'Irvine',
      'Orange',
      'Fullerton',
      'Riverside',
      'San Bernardino',
      'Ontario',
      'Temecula',
      'Murrieta',
      'San Diego',
      'Chula Vista',
      'Oceanside',
      'Ventura',
      'Oxnard',
      'Bakersfield'
    ]) as city
    union all
    -- Northern California
    select (select id from markets where slug = 'northern-california') as metro_market_id, 'CA'::text as state, unnest(array[
      'San Jose',
      'Santa Clara',
      'Sunnyvale',
      'Fremont',
      'Oakland',
      'Walnut Creek',
      'Concord',
      'Sacramento',
      'Roseville',
      'Davis',
      'Stockton',
      'Modesto',
      'Santa Rosa',
      'Fairfield'
    ]) as city
  )
  insert into public.metro_market_city_rules (metro_market_id, state, city)
  select d.metro_market_id, d.state, d.city
  from desired d
  where d.metro_market_id is not null
  on conflict (metro_market_id, state, city) do nothing;
end $$;

