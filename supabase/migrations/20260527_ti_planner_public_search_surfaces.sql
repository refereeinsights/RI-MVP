-- TI Weekend Planner: public read surfaces for authenticated search (no service-role reads).
-- NOTE: `public.venues` and `public.tournaments` base tables remain admin-only under RLS.
-- These views intentionally bypass base table RLS (security_invoker=false) and rely on:
--   1) restricted column selection, and
--   2) explicit grants (authenticated only; not anon/public)
-- as the security boundary.

-- Venues: safe subset for autocomplete display.
create or replace view public.venues_public
with (security_invoker = false) as
select
  id,
  name,
  address,
  city,
  state,
  zip,
  sport
from public.venues;

-- Tournaments: safe subset for autocomplete display (published + canonical only).
create or replace view public.tournaments_search_public
with (security_invoker = false) as
select
  id,
  name,
  city,
  state,
  start_date,
  end_date
from public.tournaments
where status = 'published'
  and is_canonical = true;

-- Guardrails: no anonymous/public access.
revoke all on table public.venues_public from public;
revoke all on table public.venues_public from anon;
revoke all on table public.venues_public from authenticated;

revoke all on table public.tournaments_search_public from public;
revoke all on table public.tournaments_search_public from anon;
revoke all on table public.tournaments_search_public from authenticated;

-- Authenticated users may read these views (planner is authenticated).
grant select on table public.venues_public to authenticated;
grant select on table public.tournaments_search_public to authenticated;

-- Service role may also read (safe).
grant select on table public.venues_public to service_role;
grant select on table public.tournaments_search_public to service_role;

