-- Fix venue slug generation so uppercase letters are preserved before normalization.
-- Also backfill existing broken slugs using the corrected generator with collision-safe dedupe.

begin;

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

  base := regexp_replace(
    regexp_replace(
      regexp_replace(
        lower(array_to_string(base_parts, ' ')),
        '''', '', 'g'
      ),
      '&', ' and ', 'g'
    ),
    '[^a-z0-9]+', '-', 'g'
  );

  base := regexp_replace(base, '(^-+|-+$)', '', 'g');
  if base = '' then
    return 'venue';
  end if;
  return base;
end;
$$;

with base as (
  select
    id,
    public.fn_make_venue_slug(name, city, state) as base_slug
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
  and v.seo_slug is distinct from d.final_slug;

commit;
