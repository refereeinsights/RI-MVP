-- Add venue-level player parking notes/amount field.

alter table public.venues
  add column if not exists player_parking text;
