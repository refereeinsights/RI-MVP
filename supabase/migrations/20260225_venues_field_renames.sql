-- Rename legacy venue columns to clearer names.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venues'
      and column_name = 'player_parking'
  ) then
    alter table public.venues
      rename column player_parking to player_parking_fee;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venues'
      and column_name = 'food_concessions_quality_score'
  ) then
    alter table public.venues
      rename column food_concessions_quality_score to vendor_score;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venues'
      and column_name = 'shade_weather_protection_score'
  ) then
    alter table public.venues
      rename column shade_weather_protection_score to shade_score;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'venues_food_concessions_quality_score_range'
  ) then
    alter table public.venues drop constraint venues_food_concessions_quality_score_range;
  end if;

  if exists (
    select 1 from pg_constraint where conname = 'venues_shade_weather_protection_score_range'
  ) then
    alter table public.venues drop constraint venues_shade_weather_protection_score_range;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venues'
      and column_name = 'vendor_score'
  ) and not exists (
    select 1 from pg_constraint where conname = 'venues_vendor_score_range'
  ) then
    alter table public.venues
      add constraint venues_vendor_score_range
      check (vendor_score between 1 and 5) not valid;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venues'
      and column_name = 'shade_score'
  ) and not exists (
    select 1 from pg_constraint where conname = 'venues_shade_score_range'
  ) then
    alter table public.venues
      add constraint venues_shade_score_range
      check (shade_score between 1 and 5) not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'venues_vendor_score_range'
  ) then
    alter table public.venues validate constraint venues_vendor_score_range;
  end if;

  if exists (
    select 1 from pg_constraint where conname = 'venues_shade_score_range'
  ) then
    alter table public.venues validate constraint venues_shade_score_range;
  end if;
end $$;
