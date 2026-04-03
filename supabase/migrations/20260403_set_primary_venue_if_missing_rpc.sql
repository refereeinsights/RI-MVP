-- Tournament venues: set primary link if missing (v1)
-- Helper RPC used by admin venue-merge tooling to promote a moved target venue link to primary
-- only when the tournament currently has no primary venue.
--
-- Locked down to service role.

create or replace function public.set_primary_venue_for_tournaments_if_missing_v1(
  p_tournament_ids uuid[],
  p_venue_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated bigint := 0;
begin
  if p_tournament_ids is null or array_length(p_tournament_ids, 1) is null then
    return jsonb_build_object('ok', true, 'updated', 0);
  end if;
  if p_venue_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_venue_id');
  end if;

  update public.tournament_venues tv
  set is_primary = true
  where tv.tournament_id = any(p_tournament_ids)
    and tv.venue_id = p_venue_id
    and tv.is_primary is distinct from true
    and not exists (
      select 1
      from public.tournament_venues x
      where x.tournament_id = tv.tournament_id
        and x.is_primary = true
    );

  get diagnostics v_updated = row_count;

  return jsonb_build_object('ok', true, 'updated', v_updated);
end $$;

revoke all on function public.set_primary_venue_for_tournaments_if_missing_v1(uuid[], uuid) from public;
grant execute on function public.set_primary_venue_for_tournaments_if_missing_v1(uuid[], uuid) to service_role;

