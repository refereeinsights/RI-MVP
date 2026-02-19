-- Add player parking field and allow parking fee enrichment candidates.

alter table public.tournaments
  add column if not exists player_parking text;

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
  games_guaranteed,
  player_parking
from public.tournaments
where status = 'published'
  and is_canonical = true;

revoke all on table public.tournaments_public from public;
revoke all on table public.tournaments_public from anon;
revoke all on table public.tournaments_public from authenticated;
grant select on table public.tournaments_public to service_role;

alter table public.tournament_attribute_candidates
  drop constraint if exists tournament_attribute_candidates_value_check;

alter table public.tournament_attribute_candidates
  add constraint tournament_attribute_candidates_value_check
  check (
    (attribute_key = 'cash_at_field' and attribute_value in ('yes','no'))
    or (attribute_key = 'referee_food' and attribute_value in ('snacks','meal'))
    or (attribute_key = 'facilities' and attribute_value in ('restrooms','portables'))
    or (attribute_key = 'referee_tents' and attribute_value in ('yes','no'))
    or (attribute_key = 'travel_lodging' and attribute_value in ('hotel','stipend'))
    or (attribute_key = 'ref_game_schedule' and attribute_value in ('too close','just right','too much down time'))
    or (attribute_key = 'ref_parking' and attribute_value in ('close','a stroll','a hike'))
    or (attribute_key = 'ref_parking_cost' and attribute_value in ('free','paid'))
    or (attribute_key = 'mentors' and attribute_value in ('yes','no'))
    or (attribute_key = 'assigned_appropriately' and attribute_value in ('yes','no'))
    or (attribute_key = 'team_fee' and length(trim(attribute_value)) > 0)
    or (attribute_key = 'games_guaranteed' and attribute_value ~ '^[0-9]{1,2}$')
    or (attribute_key = 'player_parking' and (attribute_value ~ '^\\$[0-9]{1,4}(\\.[0-9]{2})?$' or lower(trim(attribute_value)) = 'free'))
    or (attribute_key = 'address' and length(trim(attribute_value)) > 0)
    or (attribute_key = 'venue_url' and attribute_value ~* '^https?://')
  );
