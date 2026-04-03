-- Tournament venues: self-healing primary index repair RPC (v1)
-- Some environments may have an earlier (incorrect) unique index on `tournament_venues(tournament_id)`
-- named `tournament_venues_one_primary_per_tournament_idx` without the intended partial `WHERE is_primary` clause.
--
-- This RPC:
-- - Ensures `tournament_venues.is_primary` exists
-- - Normalizes any multi-primary corruption (keeps oldest primary per tournament)
-- - Drops the misconfigured index if detected and recreates the correct partial unique index
-- - Optionally triggers a PostgREST schema cache reload
--
-- Locked down to service role (admin server actions).

create or replace function public.repair_tournament_venues_primary_index_v1(
  p_reload_schema boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_idxdef text;
  v_dropped boolean := false;
begin
  if to_regclass('public.tournament_venues') is null then
    return jsonb_build_object('ok', false, 'reason', 'tournament_venues_missing');
  end if;

  alter table public.tournament_venues
    add column if not exists is_primary boolean not null default false;

  -- If multiple primaries exist, keep the oldest and clear the rest.
  with ranked as (
    select
      tv.tournament_id,
      tv.venue_id,
      row_number() over (partition by tv.tournament_id order by tv.created_at asc nulls last, tv.venue_id asc) as rn
    from public.tournament_venues tv
    where tv.is_primary = true
  )
  update public.tournament_venues tv
  set is_primary = false
  from ranked r
  where tv.tournament_id = r.tournament_id
    and tv.venue_id = r.venue_id
    and r.rn > 1;

  select i.indexdef
  into v_prev_idxdef
  from pg_indexes i
  where i.schemaname = 'public'
    and i.indexname = 'tournament_venues_one_primary_per_tournament_idx';

  if v_prev_idxdef is not null then
    if position('where' in lower(v_prev_idxdef)) = 0 or v_prev_idxdef not ilike '%where%is_primary%' then
      execute 'drop index if exists public.tournament_venues_one_primary_per_tournament_idx';
      v_dropped := true;
    end if;
  end if;

  create unique index if not exists tournament_venues_one_primary_per_tournament_idx
    on public.tournament_venues (tournament_id)
    where is_primary;

  create index if not exists tournament_venues_tournament_primary_created_idx
    on public.tournament_venues (tournament_id, is_primary, created_at);

  if coalesce(p_reload_schema, true) then
    perform pg_notify('pgrst', 'reload schema');
  end if;

  return jsonb_build_object(
    'ok', true,
    'dropped_misconfigured_index', v_dropped,
    'previous_indexdef', v_prev_idxdef,
    'reloaded_schema', coalesce(p_reload_schema, true)
  );
end $$;

revoke all on function public.repair_tournament_venues_primary_index_v1(boolean) from public;
grant execute on function public.repair_tournament_venues_primary_index_v1(boolean) to service_role;

