alter table public.tournament_partner_nearby
  add column if not exists venue_id uuid references public.venues(id) on delete cascade;

create index if not exists tournament_partner_nearby_tournament_idx
  on public.tournament_partner_nearby (tournament_id, venue_id, is_active, category, sort_order, created_at desc);
