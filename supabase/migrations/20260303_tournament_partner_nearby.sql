create table if not exists public.tournament_partner_nearby (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete cascade,
  category text not null check (category in ('food', 'coffee', 'hotel')),
  name text not null,
  address text,
  maps_url text,
  distance_meters numeric,
  sponsor_click_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournament_partner_nearby_tournament_idx
  on public.tournament_partner_nearby (tournament_id, venue_id, is_active, category, sort_order, created_at desc);
