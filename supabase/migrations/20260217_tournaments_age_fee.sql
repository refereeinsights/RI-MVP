-- Add optional tournament division/fee fields and expose them on constrained public surface.

alter table public.tournaments
  add column if not exists age_group text,
  add column if not exists team_fee text,
  add column if not exists games_guaranteed text;

create or replace view public.tournaments_public
with (security_invoker = true) as
select
  id,
  slug,
  name,
  sport,
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
  mentors,
  tournament_staff_verified,
  age_group,
  team_fee,
  games_guaranteed
from public.tournaments
where status = 'published'
  and is_canonical = true;

revoke all on table public.tournaments_public from public;
revoke all on table public.tournaments_public from anon;
revoke all on table public.tournaments_public from authenticated;
grant select on table public.tournaments_public to service_role;
