-- Metro markets (v1) region expansion
-- Adds new metro/region markets + state mappings for SEO landing pages.
-- Safe to rerun; does not delete existing mappings.

do $$
begin
  if to_regclass('public.metro_markets') is null or to_regclass('public.metro_market_states') is null then
    -- Base metro tables not installed in this env yet.
    return;
  end if;

  with desired_markets (slug, name) as (
    values
      ('dc-metro', 'DC Metro'),
      ('new-england', 'New England'),
      ('southern-california', 'Southern California'),
      ('northern-california', 'Northern California'),
      ('texas-triangle', 'Texas Triangle'),
      ('great-lakes', 'Great Lakes'),
      ('southeast', 'Southeast'),
      ('mountain-west', 'Mountain West'),
      ('pacific-northwest', 'Pacific Northwest')
  )
  insert into public.metro_markets (slug, name)
  select slug, name
  from desired_markets
  on conflict (slug) do update
  set name = excluded.name;

  with desired_states (slug, state) as (
    values
      -- dc-metro
      ('dc-metro', 'DC'),
      ('dc-metro', 'VA'),
      ('dc-metro', 'MD'),

      -- new-england
      ('new-england', 'CT'),
      ('new-england', 'RI'),
      ('new-england', 'ME'),
      ('new-england', 'NH'),

      -- southern-california (SEO-first v1: overlaps CA)
      ('southern-california', 'CA'),

      -- northern-california (SEO-first v1: overlaps CA)
      ('northern-california', 'CA'),

      -- texas-triangle
      ('texas-triangle', 'TX'),

      -- great-lakes
      ('great-lakes', 'IL'),
      ('great-lakes', 'IN'),
      ('great-lakes', 'OH'),
      ('great-lakes', 'MI'),

      -- southeast
      ('southeast', 'GA'),
      ('southeast', 'FL'),
      ('southeast', 'NC'),
      ('southeast', 'SC'),
      ('southeast', 'TN'),

      -- mountain-west
      ('mountain-west', 'CO'),
      ('mountain-west', 'UT'),
      ('mountain-west', 'NV'),
      ('mountain-west', 'AZ'),

      -- pacific-northwest
      ('pacific-northwest', 'WA'),
      ('pacific-northwest', 'OR'),
      ('pacific-northwest', 'ID')
  )
  insert into public.metro_market_states (metro_market_id, state)
  select m.id, upper(ds.state)
  from desired_states ds
  join public.metro_markets m on m.slug = ds.slug
  on conflict (metro_market_id, state) do nothing;
end $$;

