-- Rollback: remove venue SEO slug support.
begin;
drop trigger if exists set_venue_seo_slug on public.venues;
drop function if exists public.trg_set_venue_seo_slug();
drop function if exists public.fn_make_venue_slug(text, text, text);
drop index if exists venues_seo_slug_key;
alter table if exists public.venues drop column if exists seo_slug;
commit;
