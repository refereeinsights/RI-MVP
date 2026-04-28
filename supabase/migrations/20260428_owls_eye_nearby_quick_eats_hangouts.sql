-- Owl's Eye: add Quick Eats + Hangouts categories (v1) and provider metadata for nearby cache
--
-- Motivation:
-- - Store additional cached nearby place categories (quick_eats, hangouts) without new tables.
-- - Support multi-provider ingestion (Foursquare primary, Google fallback) with minimal per-row metadata.

do $$
declare
  cname text;
begin
  if to_regclass('public.owls_eye_nearby_food') is null then
    return;
  end if;

  alter table public.owls_eye_nearby_food
    add column if not exists provider text not null default 'google',
    add column if not exists provider_place_id text,
    add column if not exists search_radius_meters integer,
    add column if not exists fallback_used boolean not null default false,
    add column if not exists fallback_reason text,
    add column if not exists reason_tags text[],
    add column if not exists place_latitude double precision,
    add column if not exists place_longitude double precision;

  -- Provider allowlist
  if not exists (
    select 1
    from pg_constraint
    where conname = 'owls_eye_nearby_food_provider_allowed'
  ) then
    alter table public.owls_eye_nearby_food
      add constraint owls_eye_nearby_food_provider_allowed
      check (provider in ('foursquare', 'google'));
  end if;

  -- Drop any existing CHECK constraints that validate the category column, then recreate allowlist.
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'public.owls_eye_nearby_food'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table public.owls_eye_nearby_food drop constraint %I', cname);
  end loop;

  execute $sql$
    alter table public.owls_eye_nearby_food
      add constraint owls_eye_nearby_food_category_allowed
      check (
        category in (
          'food',
          'coffee',
          'hotel',
          'hotels',
          'sporting_goods',
          'big_box_fallback',
          'quick_eats',
          'hangouts'
        )
      )
  $sql$;
end $$;

create index if not exists owls_eye_nearby_food_run_category_idx
  on public.owls_eye_nearby_food (run_id, category);

create index if not exists owls_eye_nearby_food_provider_place_id_idx
  on public.owls_eye_nearby_food (provider, provider_place_id)
  where provider_place_id is not null;

