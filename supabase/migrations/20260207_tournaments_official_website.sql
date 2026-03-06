-- Add official website field for tournaments
alter table if exists public.tournaments
  add column if not exists official_website_url text;

create index if not exists tournaments_official_website_idx
  on public.tournaments (official_website_url);
