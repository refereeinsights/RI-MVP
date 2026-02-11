-- Create venues + tournament_venues join table to support multi-venue tournaments.
create extension if not exists "pgcrypto";

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text,
  address text,
  city text,
  state text,
  zip text,
  sport text,
  created_at timestamptz default now()
);

-- Ensure columns exist if venues table pre-dates this migration.
alter table public.venues
  add column if not exists name text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip text,
  add column if not exists sport text,
  add column if not exists created_at timestamptz default now();

-- Prevent obvious duplicates (exact match on provided fields).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'venues_name_address_city_state_key') then
    alter table public.venues
      add constraint venues_name_address_city_state_key unique (name, address, city, state);
  end if;
end $$;

create table if not exists public.tournament_venues (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (tournament_id, venue_id)
);

create index if not exists tournament_venues_venue_idx on public.tournament_venues(venue_id);
create index if not exists tournament_venues_tournament_idx on public.tournament_venues(tournament_id);

alter table public.venues enable row level security;
alter table public.tournament_venues enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'admin_all_venues') then
    create policy admin_all_venues
      on public.venues
      for all
      using (is_admin())
      with check (is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'admin_all_tournament_venues') then
    create policy admin_all_tournament_venues
      on public.tournament_venues
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;

-- Backfill existing tournament venue/address into venues + join table.
insert into public.venues (name, address, city, state, sport)
select distinct t.venue, t.address, t.city, t.state, t.sport
from public.tournaments t
where coalesce(t.venue, '') <> '' or coalesce(t.address, '') <> ''
on conflict (name, address, city, state) do nothing;

insert into public.tournament_venues (tournament_id, venue_id)
select t.id, v.id
from public.tournaments t
join public.venues v
  on v.name is not distinct from t.venue
 and v.address is not distinct from t.address
 and v.city is not distinct from t.city
 and v.state is not distinct from t.state
where coalesce(t.venue, '') <> '' or coalesce(t.address, '') <> ''
on conflict do nothing;
