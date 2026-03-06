-- Track last fees/venue scrape attempt per tournament to enforce cooldown window.

alter table public.tournaments
  add column if not exists fees_venue_scraped_at timestamptz;

create index if not exists tournaments_fees_venue_scraped_at_idx
  on public.tournaments (fees_venue_scraped_at);
