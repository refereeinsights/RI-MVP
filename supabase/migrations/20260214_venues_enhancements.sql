-- Venue enrichment: add optional geo/amenity metadata.
alter table public.venues
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists normalized_address text,
  add column if not exists geocode_source text,
  add column if not exists timezone text,
  add column if not exists surface text,
  add column if not exists field_type text,
  add column if not exists indoor boolean,
  add column if not exists lighting boolean,
  add column if not exists parking_notes text,
  add column if not exists field_rating integer,
  add column if not exists venue_type text,
  add column if not exists field_count integer,
  add column if not exists field_monitors boolean,
  add column if not exists referee_mentors boolean,
  add column if not exists food_vendors boolean,
  add column if not exists coffee_vendors boolean,
  add column if not exists tournament_vendors boolean,
  add column if not exists field_lighting boolean,
  add column if not exists referee_tent text,
  add column if not exists restrooms text,
  add column if not exists restrooms_cleanliness integer;

-- Light constraints for enums/ratings/counts.
alter table public.venues
  add constraint venues_field_rating_range check (field_rating between 1 and 5) not valid,
  add constraint venues_restrooms_allowed check (restrooms in ('portable', 'building', 'both')) not valid,
  add constraint venues_restrooms_cleanliness_range check (restrooms_cleanliness between 1 and 5) not valid,
  add constraint venues_field_count_nonnegative check (field_count is null or field_count >= 0) not valid,
  add constraint venues_venue_type_allowed check (venue_type in ('complex', 'school', 'stadium', 'park')) not valid,
  add constraint venues_referee_tent_allowed check (referee_tent in ('yes', 'no', 'multiple')) not valid;

alter table public.venues validate constraint venues_field_rating_range;
alter table public.venues validate constraint venues_restrooms_allowed;
alter table public.venues validate constraint venues_restrooms_cleanliness_range;
alter table public.venues validate constraint venues_field_count_nonnegative;
alter table public.venues validate constraint venues_venue_type_allowed;
alter table public.venues validate constraint venues_referee_tent_allowed;
