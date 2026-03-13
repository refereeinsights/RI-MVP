-- Add SEO slugs for venues with collision handling and trigger for new inserts.
begin;

-- 1) Column
alter table if exists public.venues
  add column if not exists seo_slug text;

-- 2) Slug helper
create or replace function public.fn_make_venue_slug(p_name text, p_city text, p_state text)
returns text
language plpgsql
immutable
as $$
declare
  base_parts text[];
  base text;
begin
  base_parts := array[
    coalesce(p_name, ''),
    coalesce(p_city, ''),
    coalesce(p_state, '')
  ];

  base := lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          array_to_string(base_parts, ' '),
          '''', '', 'g' -- drop apostrophes
        ),
        '&', ' and ', 'g' -- & -> and
      ),
      '[^a-z0-9]+', '-', 'g'
    )
  );

  base := regexp_replace(base, '(^-+|-+$)', '', 'g'); -- trim hyphens
  if base = '' then
    return 'venue';
  end if;
  return base;
end;
$$;

-- 3) Backfill with collision-safe suffixes
with base as (
  select
    id,
    fn_make_venue_slug(name, city, state) as base_slug
  from public.venues
),
dedup as (
  select
    id,
    base_slug,
    base_slug ||
      case when row_number() over (partition by base_slug order by id) = 1
           then ''
           else '-' || row_number() over (partition by base_slug order by id)
      end as final_slug
  from base
)
update public.venues v
set seo_slug = d.final_slug
from dedup d
where v.id = d.id
  and (v.seo_slug is null or v.seo_slug = '');

-- 4) Unique index
create unique index if not exists venues_seo_slug_key on public.venues(seo_slug);

-- 5) Trigger to set slug on insert (and resolve collisions)
create or replace function public.trg_set_venue_seo_slug()
returns trigger
language plpgsql
as $$
declare
  base text;
  candidate text;
  suffix int := 2;
begin
  if coalesce(new.seo_slug, '') = '' then
    new.seo_slug := public.fn_make_venue_slug(new.name, new.city, new.state);
  end if;

  base := new.seo_slug;
  candidate := base;
  while exists (select 1 from public.venues v where v.seo_slug = candidate and v.id <> new.id) loop
    candidate := base || '-' || suffix;
    suffix := suffix + 1;
  end loop;
  new.seo_slug := candidate;
  return new;
end;
$$;

drop trigger if exists set_venue_seo_slug on public.venues;
create trigger set_venue_seo_slug
before insert on public.venues
for each row
execute function public.trg_set_venue_seo_slug();

-- 6) Enforce NOT NULL after backfill
alter table public.venues
  alter column seo_slug set not null;

commit;
