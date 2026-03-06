-- Allow dismissing email discovery rows from the review list.
alter table if exists public.tournament_email_discovery_results
  add column if not exists dismissed_at timestamptz;

create index if not exists tournament_email_discovery_results_dismissed_idx
  on public.tournament_email_discovery_results(dismissed_at);
