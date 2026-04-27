-- TI: tournament static map storage columns (v1)
--
-- Motivation:
-- - TournamentInsights tournament pages should render a cached static map preview
--   without loading Mapbox GL.
-- - Static maps are generated out-of-band and stored in Supabase Storage.

alter table public.tournaments
  add column if not exists static_map_path text,
  add column if not exists static_map_source_hash text,
  add column if not exists static_map_version integer default 1,
  add column if not exists static_map_status text default 'missing',
  add column if not exists static_map_updated_at timestamptz,
  add column if not exists static_map_error text,
  add column if not exists static_map_processing_started_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tournaments_static_map_status_check'
  ) then
    alter table public.tournaments
      add constraint tournaments_static_map_status_check
      check (static_map_status in ('missing', 'queued', 'processing', 'ready', 'error'));
  end if;
end $$;

create index if not exists tournaments_static_map_status_idx
  on public.tournaments (static_map_status, static_map_updated_at desc nulls last);

create index if not exists tournaments_static_map_processing_started_at_idx
  on public.tournaments (static_map_processing_started_at desc nulls last);

-- Recreate tournaments_public with the new static map fields (keeps stable column surface).
drop view if exists public.tournaments_public;

create or replace view public.tournaments_public
with (security_invoker = true) as
select
  id,
  slug,
  name,
  sport,
  tournament_association,
  level,
  state,
  city,
  zip,
  start_date,
  end_date,
  source_url,
  official_website_url,
  summary,
  referee_contact,
  tournament_director,
  venue,
  address,
  updated_at,
  tournament_staff_verified,
  is_demo,
  latitude,
  longitude,
  geo_source,
  geo_updated_at,
  static_map_path,
  static_map_status,
  static_map_updated_at
from public.tournaments
where status = 'published'
  and is_canonical = true;

revoke all on table public.tournaments_public from public;
revoke all on table public.tournaments_public from anon;
revoke all on table public.tournaments_public from authenticated;
grant select on table public.tournaments_public to service_role;

