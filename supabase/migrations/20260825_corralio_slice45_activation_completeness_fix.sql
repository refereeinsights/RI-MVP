-- Slice 4.5 repair after the base migration was applied.
-- Activation must reject incomplete provenance and over-cap staged pools.

create or replace function public.corralio_activate_overture_refresh_v1(p_refresh_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_refresh public.corralio_overture_refreshes%rowtype;
begin
  select * into v_refresh from public.corralio_overture_refreshes
  where id = p_refresh_id for update;
  if not found or v_refresh.mode <> 'apply' or v_refresh.status <> 'staging' then
    return false;
  end if;

  if exists (
    select 1
    from public.corralio_overture_candidates candidate
    where candidate.refresh_id = p_refresh_id
      and not exists (
        select 1 from public.corralio_overture_provenance provenance
        where provenance.candidate_id = candidate.id
      )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.corralio_overture_candidates candidate
    where candidate.refresh_id = p_refresh_id
    group by candidate.canonical_venue_id, candidate.provisional_venue_id, candidate.category
    having count(*) > v_refresh.max_candidates_per_category
  ) then
    return false;
  end if;

  update public.corralio_overture_candidates old
  set active = false, activated_at = null
  where old.active
    and exists (
      select 1 from public.corralio_overture_refresh_scopes scope
      where scope.refresh_id = p_refresh_id
        and scope.category = old.category
        and scope.canonical_venue_id is not distinct from old.canonical_venue_id
        and scope.provisional_venue_id is not distinct from old.provisional_venue_id
    );

  update public.corralio_overture_candidates
  set active = true, activated_at = now()
  where refresh_id = p_refresh_id and not active;

  update public.corralio_overture_refreshes
  set status = 'active', completed_at = now()
  where id = p_refresh_id;
  return true;
end
$function$;

revoke all on function public.corralio_activate_overture_refresh_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.corralio_activate_overture_refresh_v1(uuid)
  to service_role;
alter function public.corralio_activate_overture_refresh_v1(uuid)
  owner to postgres;
