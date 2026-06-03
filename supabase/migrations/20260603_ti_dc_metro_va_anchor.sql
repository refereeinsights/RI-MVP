-- Anchor canonical DC Metro SEO hubs under Virginia using city rules.
-- Purpose:
-- - keep `/{sport}/{state}/{metro}` as the canonical metro SEO route family
-- - make `dc-metro` eligible for city-metro sitemap generation under `/virginia/dc-metro`
-- - leave legacy `/tournaments/metro/dc-metro` directory behavior untouched

do $$
declare
  v_market_id uuid;
begin
  if to_regclass('public.metro_markets') is null
     or to_regclass('public.metro_market_states') is null
     or to_regclass('public.metro_market_city_rules') is null then
    return;
  end if;

  insert into public.metro_markets (slug, name)
  values ('dc-metro', 'DC Metro')
  on conflict (slug) do update
  set name = excluded.name
  returning id into v_market_id;

  if v_market_id is null then
    select id into v_market_id
    from public.metro_markets
    where slug = 'dc-metro';
  end if;

  if v_market_id is null then
    return;
  end if;

  delete from public.metro_market_states
  where metro_market_id = v_market_id
    and upper(trim(state)) <> 'VA';

  insert into public.metro_market_states (metro_market_id, state)
  values (v_market_id, 'VA')
  on conflict (metro_market_id, state) do nothing;

  delete from public.metro_market_city_rules
  where metro_market_id = v_market_id
    and upper(trim(state)) <> 'VA';

  insert into public.metro_market_city_rules (metro_market_id, state, city)
  values
    (v_market_id, 'VA', 'Alexandria'),
    (v_market_id, 'VA', 'Annandale'),
    (v_market_id, 'VA', 'Arlington'),
    (v_market_id, 'VA', 'Fairfax'),
    (v_market_id, 'VA', 'Falls Church'),
    (v_market_id, 'VA', 'Herndon'),
    (v_market_id, 'VA', 'Leesburg'),
    (v_market_id, 'VA', 'Manassas'),
    (v_market_id, 'VA', 'McLean'),
    (v_market_id, 'VA', 'Reston'),
    (v_market_id, 'VA', 'Springfield'),
    (v_market_id, 'VA', 'Sterling'),
    (v_market_id, 'VA', 'Vienna'),
    (v_market_id, 'VA', 'Woodbridge')
  on conflict (metro_market_id, state, city) do nothing;
end $$;
