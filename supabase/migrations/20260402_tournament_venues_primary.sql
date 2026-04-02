-- Tournament venues primary flag (v1)
-- Adds a minimal, deterministic "primary venue" concept for tournaments.
-- Backfill is intentionally conservative: only sets primary when exactly one venue link exists.
-- If multiple primaries already exist in an environment, the migration keeps the oldest link (created_at asc) and clears the rest.

do $$
begin
  if to_regclass('public.tournament_venues') is null then
    -- tournament_venues not installed in this env yet.
    return;
  end if;

  alter table public.tournament_venues
    add column if not exists is_primary boolean not null default false;

  -- If any environment already has multiple primaries (e.g. partial/manual backfills),
  -- normalize before adding the unique index to avoid migration failure.
  with ranked as (
    select
      tv.tournament_id,
      tv.venue_id,
      row_number() over (partition by tv.tournament_id order by tv.created_at asc, tv.venue_id asc) as rn
    from public.tournament_venues tv
    where tv.is_primary = true
  )
  update public.tournament_venues tv
  set is_primary = false
  from ranked r
  where tv.tournament_id = r.tournament_id
    and tv.venue_id = r.venue_id
    and r.rn > 1;

  -- Enforce at most one primary venue per tournament.
  create unique index if not exists tournament_venues_one_primary_per_tournament_idx
    on public.tournament_venues (tournament_id)
    where is_primary;

  -- Support stable ordering (primary first, then created_at).
  create index if not exists tournament_venues_tournament_primary_created_idx
    on public.tournament_venues (tournament_id, is_primary, created_at);

  -- Backfill: if exactly one linked venue exists, mark it primary.
  with single_link as (
    select tv.tournament_id, (array_agg(tv.venue_id))[1] as venue_id
    from public.tournament_venues tv
    group by tv.tournament_id
    having count(*) = 1
  )
  update public.tournament_venues tv
  set is_primary = true
  from single_link s
  where tv.tournament_id = s.tournament_id
    and tv.venue_id = s.venue_id
    and tv.is_primary is distinct from true;
end $$;
