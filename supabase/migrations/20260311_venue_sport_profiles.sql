-- Venue sport-specific profiles (indoor/outdoor variants) + link from tournament_venues

create table if not exists public.venue_sport_profiles (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  sport text not null,
  environment text,
  name text,
  address1 text,
  address2 text,
  city text,
  state text,
  zip text,
  latitude double precision,
  longitude double precision,
  venue_url text,
  map_url text,
  restrooms text,
  restroom_cleanliness text,
  shade_score integer,
  bring_field_chairs boolean,
  player_parking_fee text,
  parking_notes text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep sport list aligned with venues.sport constraint
alter table public.venue_sport_profiles
  drop constraint if exists venue_sport_profiles_sport_allowed;

alter table public.venue_sport_profiles
  add constraint venue_sport_profiles_sport_allowed
  check (
    sport in (
      'soccer',
      'baseball',
      'softball',
      'lacrosse',
      'basketball',
      'hockey',
      'volleyball',
      'futsal'
    )
  ) not valid;

alter table public.venue_sport_profiles
  validate constraint venue_sport_profiles_sport_allowed;

-- Restrooms allowed values align with venue restrooms enum
alter table public.venue_sport_profiles
  drop constraint if exists venue_sport_profiles_restrooms_allowed;

alter table public.venue_sport_profiles
  add constraint venue_sport_profiles_restrooms_allowed
  check (restrooms is null or restrooms in ('Portable', 'Building', 'Both')) not valid;

alter table public.venue_sport_profiles
  validate constraint venue_sport_profiles_restrooms_allowed;

-- Shade score 1-5 (same as venues.shade_score)
alter table public.venue_sport_profiles
  drop constraint if exists venue_sport_profiles_shade_score_range;

alter table public.venue_sport_profiles
  add constraint venue_sport_profiles_shade_score_range
  check (shade_score between 1 and 5) not valid;

alter table public.venue_sport_profiles
  validate constraint venue_sport_profiles_shade_score_range;

-- Environment helper enum-ish text; not enforced yet.

-- Uniqueness: one profile per venue+sport (can expand later)
create unique index if not exists venue_sport_profiles_venue_sport_idx on public.venue_sport_profiles (venue_id, sport);
create index if not exists venue_sport_profiles_venue_idx on public.venue_sport_profiles (venue_id);

-- Link tournaments to a sport profile when known
alter table public.tournament_venues
  add column if not exists venue_sport_profile_id uuid references public.venue_sport_profiles(id) on delete set null;

create index if not exists tournament_venues_profile_idx on public.tournament_venues (venue_sport_profile_id);
