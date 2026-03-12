-- Recreate tournaments_public to include tournament_association and is_demo.

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
  is_demo
from public.tournaments
where status = 'published'
  and is_canonical = true;

revoke all on table public.tournaments_public from public;
revoke all on table public.tournaments_public from anon;
revoke all on table public.tournaments_public from authenticated;
grant select on table public.tournaments_public to service_role;
