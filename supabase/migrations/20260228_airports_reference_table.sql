create table if not exists public.airports (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'ourairports',
  source_airport_id bigint unique,
  ident text not null,
  airport_type text not null,
  name text not null,
  municipality text,
  iso_country text not null,
  iso_region text,
  continent text,
  iata_code text,
  gps_code text,
  local_code text,
  latitude_deg double precision not null,
  longitude_deg double precision not null,
  elevation_ft integer,
  scheduled_service boolean not null default false,
  is_commercial boolean not null default false,
  is_major boolean not null default false,
  major_rank smallint,
  home_link text,
  wikipedia_link text,
  keywords text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint airports_source_allowed check (source in ('ourairports')),
  constraint airports_type_allowed check (
    airport_type in (
      'large_airport',
      'medium_airport',
      'small_airport',
      'heliport',
      'seaplane_base',
      'balloonport',
      'closed'
    )
  ),
  constraint airports_ident_nonblank check (btrim(ident) <> ''),
  constraint airports_name_nonblank check (btrim(name) <> ''),
  constraint airports_iata_code_len check (iata_code is null or char_length(btrim(iata_code)) between 3 and 4),
  constraint airports_major_rank_range check (major_rank is null or major_rank between 1 and 5)
);

create unique index if not exists airports_ident_key on public.airports (ident);
create unique index if not exists airports_iata_code_key
  on public.airports (iata_code)
  where iata_code is not null;
create index if not exists airports_is_major_idx on public.airports (is_major);
create index if not exists airports_is_commercial_idx on public.airports (is_commercial);
create index if not exists airports_country_region_idx on public.airports (iso_country, iso_region);
create index if not exists airports_lat_lng_idx on public.airports (latitude_deg, longitude_deg);

create or replace function public.set_airports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_airports_updated_at on public.airports;
create trigger trg_airports_updated_at
before update on public.airports
for each row
execute function public.set_airports_updated_at();
