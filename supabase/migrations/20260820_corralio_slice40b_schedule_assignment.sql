-- Corralio Slice 4.0B: owner-authorized source assignment with atomic
-- propagation to existing imported events. Apply manually in a controlled
-- production migration. This function performs no feed fetch or refresh work.

create or replace function public.corralio_update_schedule_source_assignment_v1(
  p_source_id uuid,
  p_child_id uuid default null,
  p_team_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_source_id uuid;
  v_child_id uuid;
  v_team_id uuid;
  v_persisted_child_id uuid;
  v_persisted_team_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select member.household_id
    into v_household_id
  from public.corralio_household_members member
  where member.user_id = v_user_id
    and member.role = 'owner'
    and member.status = 'active'
  limit 1;

  if v_household_id is null then
    raise exception 'Schedule source not found or access denied' using errcode = '42501';
  end if;

  -- Constrain authorization before taking the consistency lock so a caller
  -- cannot lock another household's source by probing its UUID.
  select source.id
    into v_source_id
  from public.corralio_schedule_sources source
  where source.id = p_source_id
    and source.household_id = v_household_id
    and source.source_type = 'ics'
    and source.sync_status in ('pending', 'success', 'error')
  for update;

  if v_source_id is null then
    raise exception 'Schedule source not found or access denied' using errcode = '42501';
  end if;

  if p_team_id is not null and p_child_id is null then
    raise exception 'Choose a child before choosing a team' using errcode = '22023';
  end if;

  if p_child_id is not null then
    select child.id
      into v_child_id
    from public.corralio_children child
    where child.id = p_child_id
      and child.household_id = v_household_id
      and child.archived_at is null
    for share;

    if v_child_id is null then
      raise exception 'Family assignment is unavailable' using errcode = '23503';
    end if;

    if p_team_id is null then
      v_persisted_child_id := v_child_id;
    else
      select team.id
        into v_team_id
      from public.corralio_teams team
      where team.id = p_team_id
        and team.household_id = v_household_id
        and team.child_id = v_child_id
        and team.archived_at is null
      for share;

      if v_team_id is null then
        raise exception 'Family assignment is unavailable' using errcode = '23503';
      end if;

      v_persisted_team_id := v_team_id;
    end if;
  end if;

  update public.corralio_schedule_sources source
  set child_id = v_persisted_child_id,
      team_id = v_persisted_team_id
  where source.id = v_source_id
    and source.household_id = v_household_id;

  update public.corralio_events event
  set child_id = v_persisted_child_id,
      team_id = v_persisted_team_id
  where event.household_id = v_household_id
    and event.schedule_source_id = v_source_id
    and event.origin_type = 'ics';

  return true;
end;
$function$;

alter function public.corralio_update_schedule_source_assignment_v1(uuid, uuid, uuid)
  owner to postgres;

revoke all on function public.corralio_update_schedule_source_assignment_v1(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.corralio_update_schedule_source_assignment_v1(uuid, uuid, uuid)
  to authenticated, service_role;

comment on function public.corralio_update_schedule_source_assignment_v1(uuid, uuid, uuid) is
  'Owner-authorized connected-source assignment with atomic propagation to household/source-scoped imported events; returns only bounded success.';
