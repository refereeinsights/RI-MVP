-- Add tournament_staff_verified flag (defaults to false).
alter table if exists public.tournaments
  add column if not exists tournament_staff_verified boolean not null default false;
