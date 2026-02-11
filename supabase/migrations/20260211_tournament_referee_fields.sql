-- Add referee logistics fields and standardized enums for tournaments + reviews.

-- Tournaments table: new fields
alter table if exists public.tournaments
  add column if not exists level_of_competition text,
  add column if not exists cash_at_field boolean,
  add column if not exists referee_food text,
  add column if not exists facilities text,
  add column if not exists referee_tents text,
  add column if not exists travel_lodging text,
  add column if not exists ref_game_schedule text,
  add column if not exists ref_parking text,
  add column if not exists ref_parking_cost text,
  add column if not exists mentors text,
  add column if not exists assigned_appropriately text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tournaments_cash_at_field_requires_cash') then
    alter table public.tournaments
      add constraint tournaments_cash_at_field_requires_cash
      check (cash_at_field is null or cash_at_field = false or cash_tournament = true);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_referee_food_check') then
    alter table public.tournaments
      add constraint tournaments_referee_food_check check (referee_food in ('snacks','meal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_facilities_check') then
    alter table public.tournaments
      add constraint tournaments_facilities_check check (facilities in ('restrooms','portables'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_referee_tents_check') then
    alter table public.tournaments
      add constraint tournaments_referee_tents_check check (referee_tents in ('yes','no'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_travel_lodging_check') then
    alter table public.tournaments
      add constraint tournaments_travel_lodging_check check (travel_lodging in ('hotel','stipend'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_ref_game_schedule_check') then
    alter table public.tournaments
      add constraint tournaments_ref_game_schedule_check check (ref_game_schedule in ('too close','just right','too much down time'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_ref_parking_check') then
    alter table public.tournaments
      add constraint tournaments_ref_parking_check check (ref_parking in ('close','a stroll','a hike'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_ref_parking_cost_check') then
    alter table public.tournaments
      add constraint tournaments_ref_parking_cost_check check (ref_parking_cost in ('free','paid'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_mentors_check') then
    alter table public.tournaments
      add constraint tournaments_mentors_check check (mentors in ('yes','no'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_assigned_appropriately_check') then
    alter table public.tournaments
      add constraint tournaments_assigned_appropriately_check check (assigned_appropriately in ('yes','no'));
  end if;
end $$;

-- Tournament referee reviews: collect the same fields from reviewers
alter table if exists public.tournament_referee_reviews
  add column if not exists level_of_competition text,
  add column if not exists cash_at_field boolean,
  add column if not exists referee_food text,
  add column if not exists facilities text,
  add column if not exists referee_tents text,
  add column if not exists travel_lodging text,
  add column if not exists ref_game_schedule text,
  add column if not exists ref_parking text,
  add column if not exists ref_parking_cost text,
  add column if not exists mentors text,
  add column if not exists assigned_appropriately text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_reviews_referee_food_check') then
    alter table public.tournament_referee_reviews
      add constraint tournament_reviews_referee_food_check check (referee_food in ('snacks','meal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournament_reviews_facilities_check') then
    alter table public.tournament_referee_reviews
      add constraint tournament_reviews_facilities_check check (facilities in ('restrooms','portables'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournament_reviews_referee_tents_check') then
    alter table public.tournament_referee_reviews
      add constraint tournament_reviews_referee_tents_check check (referee_tents in ('yes','no'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournament_reviews_travel_lodging_check') then
    alter table public.tournament_referee_reviews
      add constraint tournament_reviews_travel_lodging_check check (travel_lodging in ('hotel','stipend'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournament_reviews_ref_game_schedule_check') then
    alter table public.tournament_referee_reviews
      add constraint tournament_reviews_ref_game_schedule_check check (ref_game_schedule in ('too close','just right','too much down time'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournament_reviews_ref_parking_check') then
    alter table public.tournament_referee_reviews
      add constraint tournament_reviews_ref_parking_check check (ref_parking in ('close','a stroll','a hike'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournament_reviews_ref_parking_cost_check') then
    alter table public.tournament_referee_reviews
      add constraint tournament_reviews_ref_parking_cost_check check (ref_parking_cost in ('free','paid'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournament_reviews_mentors_check') then
    alter table public.tournament_referee_reviews
      add constraint tournament_reviews_mentors_check check (mentors in ('yes','no'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournament_reviews_assigned_appropriately_check') then
    alter table public.tournament_referee_reviews
      add constraint tournament_reviews_assigned_appropriately_check check (assigned_appropriately in ('yes','no'));
  end if;
end $$;

-- Rename comp candidate travel field and enforce enum values
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournament_referee_comp_candidates'
      and column_name = 'travel_housing_text'
  ) then
    alter table public.tournament_referee_comp_candidates
      rename column travel_housing_text to travel_lodging;
  end if;
end $$;

-- Normalize any legacy travel text into the new enum values.
update public.tournament_referee_comp_candidates
set travel_lodging = case
  when travel_lodging is null then null
  when lower(travel_lodging) like '%hotel%' or lower(travel_lodging) like '%lodging%' or lower(travel_lodging) like '%accommod%' then 'hotel'
  when lower(travel_lodging) like '%stipend%' or lower(travel_lodging) like '%per diem%' or lower(travel_lodging) like '%reimb%' or lower(travel_lodging) like '%mileage%' or lower(travel_lodging) like '%travel%' or lower(travel_lodging) like '%meal%' then 'stipend'
  else null
end;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_referee_comp_travel_lodging_check') then
    alter table public.tournament_referee_comp_candidates
      add constraint tournament_referee_comp_travel_lodging_check check (travel_lodging in ('hotel','stipend'));
  end if;
end $$;
