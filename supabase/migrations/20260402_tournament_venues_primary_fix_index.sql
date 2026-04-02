-- Tournament venues primary flag (v1) index fix
-- Some environments may have an earlier (incorrect) unique index on `tournament_venues(tournament_id)`
-- using the name `tournament_venues_one_primary_per_tournament_idx` without a partial `WHERE is_primary` clause.
-- That would incorrectly prevent multiple venues per tournament.
--
-- This migration drops the index if it is not partial on `is_primary`, then recreates the intended partial unique index.

do $$
declare
  idxdef text;
begin
  if to_regclass('public.tournament_venues') is null then
    return;
  end if;

  select i.indexdef
  into idxdef
  from pg_indexes i
  where i.schemaname = 'public'
    and i.indexname = 'tournament_venues_one_primary_per_tournament_idx';

  if idxdef is not null then
    -- If the existing index isn't partial on is_primary, drop it so we can recreate correctly.
    if position('where' in lower(idxdef)) = 0 or idxdef not ilike '%where%is_primary%' then
      execute 'drop index if exists public.tournament_venues_one_primary_per_tournament_idx';
    end if;
  end if;

  create unique index if not exists tournament_venues_one_primary_per_tournament_idx
    on public.tournament_venues (tournament_id)
    where is_primary;
end $$;

