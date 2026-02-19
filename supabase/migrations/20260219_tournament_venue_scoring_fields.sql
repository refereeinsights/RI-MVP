-- Add planning score fields (1-5) for venues and tournaments.

alter table public.venues
  add column if not exists field_court_condition_score integer,
  add column if not exists parking_convenience_score integer,
  add column if not exists spectator_seating_availability_score integer,
  add column if not exists shade_weather_protection_score integer,
  add column if not exists food_concessions_quality_score integer,
  add column if not exists overall_cleanliness_score integer,
  add column if not exists ease_of_navigation_score integer,
  add column if not exists accessibility_score integer,
  add column if not exists lighting_score integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'venues_field_court_condition_score_range') then
    alter table public.venues add constraint venues_field_court_condition_score_range check (field_court_condition_score between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'venues_parking_convenience_score_range') then
    alter table public.venues add constraint venues_parking_convenience_score_range check (parking_convenience_score between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'venues_spectator_seating_availability_score_range') then
    alter table public.venues add constraint venues_spectator_seating_availability_score_range check (spectator_seating_availability_score between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'venues_shade_weather_protection_score_range') then
    alter table public.venues add constraint venues_shade_weather_protection_score_range check (shade_weather_protection_score between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'venues_food_concessions_quality_score_range') then
    alter table public.venues add constraint venues_food_concessions_quality_score_range check (food_concessions_quality_score between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'venues_overall_cleanliness_score_range') then
    alter table public.venues add constraint venues_overall_cleanliness_score_range check (overall_cleanliness_score between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'venues_ease_of_navigation_score_range') then
    alter table public.venues add constraint venues_ease_of_navigation_score_range check (ease_of_navigation_score between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'venues_accessibility_score_range') then
    alter table public.venues add constraint venues_accessibility_score_range check (accessibility_score between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'venues_lighting_score_range') then
    alter table public.venues add constraint venues_lighting_score_range check (lighting_score between 1 and 5) not valid;
  end if;
end $$;

alter table public.venues validate constraint venues_field_court_condition_score_range;
alter table public.venues validate constraint venues_parking_convenience_score_range;
alter table public.venues validate constraint venues_spectator_seating_availability_score_range;
alter table public.venues validate constraint venues_shade_weather_protection_score_range;
alter table public.venues validate constraint venues_food_concessions_quality_score_range;
alter table public.venues validate constraint venues_overall_cleanliness_score_range;
alter table public.venues validate constraint venues_ease_of_navigation_score_range;
alter table public.venues validate constraint venues_accessibility_score_range;
alter table public.venues validate constraint venues_lighting_score_range;

alter table public.tournaments
  add column if not exists schedule_organization_score integer,
  add column if not exists organizer_communication_score integer,
  add column if not exists check_in_process_score integer,
  add column if not exists competition_level_accuracy_score integer,
  add column if not exists value_for_cost_score integer,
  add column if not exists game_scheduling_balance_score integer,
  add column if not exists overall_experience_score integer,
  add column if not exists weather_contingency_handling_score integer,
  add column if not exists vendor_merchandise_quality_score integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tournaments_schedule_organization_score_range') then
    alter table public.tournaments add constraint tournaments_schedule_organization_score_range check (schedule_organization_score between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_organizer_communication_score_range') then
    alter table public.tournaments add constraint tournaments_organizer_communication_score_range check (organizer_communication_score between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_check_in_process_score_range') then
    alter table public.tournaments add constraint tournaments_check_in_process_score_range check (check_in_process_score between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_competition_level_accuracy_score_range') then
    alter table public.tournaments add constraint tournaments_competition_level_accuracy_score_range check (competition_level_accuracy_score between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_value_for_cost_score_range') then
    alter table public.tournaments add constraint tournaments_value_for_cost_score_range check (value_for_cost_score between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_game_scheduling_balance_score_range') then
    alter table public.tournaments add constraint tournaments_game_scheduling_balance_score_range check (game_scheduling_balance_score between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_overall_experience_score_range') then
    alter table public.tournaments add constraint tournaments_overall_experience_score_range check (overall_experience_score between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_weather_contingency_handling_score_range') then
    alter table public.tournaments add constraint tournaments_weather_contingency_handling_score_range check (weather_contingency_handling_score between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_vendor_merchandise_quality_score_range') then
    alter table public.tournaments add constraint tournaments_vendor_merchandise_quality_score_range check (vendor_merchandise_quality_score between 1 and 5) not valid;
  end if;
end $$;

alter table public.tournaments validate constraint tournaments_schedule_organization_score_range;
alter table public.tournaments validate constraint tournaments_organizer_communication_score_range;
alter table public.tournaments validate constraint tournaments_check_in_process_score_range;
alter table public.tournaments validate constraint tournaments_competition_level_accuracy_score_range;
alter table public.tournaments validate constraint tournaments_value_for_cost_score_range;
alter table public.tournaments validate constraint tournaments_game_scheduling_balance_score_range;
alter table public.tournaments validate constraint tournaments_overall_experience_score_range;
alter table public.tournaments validate constraint tournaments_weather_contingency_handling_score_range;
alter table public.tournaments validate constraint tournaments_vendor_merchandise_quality_score_range;
