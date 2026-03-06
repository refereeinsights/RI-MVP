-- Add enrichment_skip flag to tournaments to allow skipping enrichment.
alter table if exists public.tournaments
add column if not exists enrichment_skip boolean not null default false;

create index if not exists tournaments_enrichment_skip_idx on public.tournaments (enrichment_skip);
