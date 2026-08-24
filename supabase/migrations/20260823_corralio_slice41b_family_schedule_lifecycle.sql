-- Corralio Slice 4.1B: non-destructive family and schedule lifecycle.
-- Apply manually only after the reviewed Stage 2 approval. This migration
-- performs no feed fetch, cron invocation, or fixture creation.

-- Direct source deletion cascades to imported events, so browser clients must
-- use the non-destructive disconnect RPC instead.
revoke delete on table public.corralio_schedule_sources from authenticated;
drop policy if exists corralio_schedule_sources_delete_member
  on public.corralio_schedule_sources;

-- Preserve ordinary Family editing while reserving archive state for the
-- atomic lifecycle RPCs below.
revoke update on table public.corralio_children from authenticated;
grant update (display_name, color_token, sort_order)
  on table public.corralio_children to authenticated;

revoke update on table public.corralio_teams from authenticated;
grant update (display_name, sport, sort_order)
  on table public.corralio_teams to authenticated;

create or replace function public.corralio_disconnect_schedule_source_v1(
  p_source_id uuid
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
begin
  if v_user_id is null or p_source_id is null then
    return false;
  end if;

  select member.household_id
    into v_household_id
  from public.corralio_household_members member
  where member.user_id = v_user_id
    and member.role = 'owner'
    and member.status = 'active'
  limit 1;

  if v_household_id is null then
    return false;
  end if;

  select source.id
    into v_source_id
  from public.corralio_schedule_sources source
  where source.id = p_source_id
    and source.household_id = v_household_id
    and source.source_type = 'ics'
    and source.sync_status in ('pending', 'success', 'error')
  for update;

  if v_source_id is null then
    return false;
  end if;

  update public.corralio_schedule_sources source
  set sync_status = 'disconnected',
      refresh_claim_token = null,
      refresh_claimed_at = null
  where source.id = v_source_id
    and source.household_id = v_household_id;

  return true;
end;
$function$;

create or replace function public.corralio_archive_team_v1(
  p_team_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_team_id uuid;
  v_source_ids uuid[] := '{}'::uuid[];
begin
  if v_user_id is null or p_team_id is null then
    return false;
  end if;

  select member.household_id
    into v_household_id
  from public.corralio_household_members member
  where member.user_id = v_user_id
    and member.role = 'owner'
    and member.status = 'active'
  limit 1;

  if v_household_id is null then
    return false;
  end if;

  select team.id
    into v_team_id
  from public.corralio_teams team
  where team.id = p_team_id
    and team.household_id = v_household_id
    and team.archived_at is null
  for update;

  if v_team_id is null then
    return false;
  end if;

  select coalesce(array_agg(locked_source.id order by locked_source.id), '{}'::uuid[])
    into v_source_ids
  from (
    select source.id
    from public.corralio_schedule_sources source
    where source.household_id = v_household_id
      and source.team_id = v_team_id
    order by source.id
    for update
  ) locked_source;

  update public.corralio_teams team
  set archived_at = now()
  where team.id = v_team_id
    and team.household_id = v_household_id;

  update public.corralio_schedule_sources source
  set child_id = null,
      team_id = null
  where source.household_id = v_household_id
    and source.id = any(v_source_ids);

  update public.corralio_events event
  set child_id = null,
      team_id = null
  where event.household_id = v_household_id
    and event.origin_type = 'ics'
    and event.schedule_source_id = any(v_source_ids);

  return true;
end;
$function$;

create or replace function public.corralio_archive_child_v1(
  p_child_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_child_id uuid;
  v_team_ids uuid[] := '{}'::uuid[];
  v_source_ids uuid[] := '{}'::uuid[];
begin
  if v_user_id is null or p_child_id is null then
    return false;
  end if;

  select member.household_id
    into v_household_id
  from public.corralio_household_members member
  where member.user_id = v_user_id
    and member.role = 'owner'
    and member.status = 'active'
  limit 1;

  if v_household_id is null then
    return false;
  end if;

  select child.id
    into v_child_id
  from public.corralio_children child
  where child.id = p_child_id
    and child.household_id = v_household_id
    and child.archived_at is null
  for update;

  if v_child_id is null then
    return false;
  end if;

  -- Lock every team for the child, including historical archived rows, so a
  -- legacy assignment cannot survive the child lifecycle boundary.
  select coalesce(array_agg(locked_team.id order by locked_team.id), '{}'::uuid[])
    into v_team_ids
  from (
    select team.id
    from public.corralio_teams team
    where team.household_id = v_household_id
      and team.child_id = v_child_id
    order by team.id
    for update
  ) locked_team;

  select coalesce(array_agg(locked_source.id order by locked_source.id), '{}'::uuid[])
    into v_source_ids
  from (
    select source.id
    from public.corralio_schedule_sources source
    where source.household_id = v_household_id
      and (
        source.child_id = v_child_id
        or source.team_id = any(v_team_ids)
      )
    order by source.id
    for update
  ) locked_source;

  update public.corralio_children child
  set archived_at = now()
  where child.id = v_child_id
    and child.household_id = v_household_id;

  update public.corralio_teams team
  set archived_at = coalesce(team.archived_at, now())
  where team.household_id = v_household_id
    and team.id = any(v_team_ids);

  update public.corralio_schedule_sources source
  set child_id = null,
      team_id = null
  where source.household_id = v_household_id
    and source.id = any(v_source_ids);

  update public.corralio_events event
  set child_id = null,
      team_id = null
  where event.household_id = v_household_id
    and event.origin_type = 'ics'
    and event.schedule_source_id = any(v_source_ids);

  return true;
end;
$function$;

-- Keep Slice 4.0B behavior while aligning its lock order with lifecycle RPCs:
-- active child -> active team -> active source -> imported events.
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

alter function public.corralio_disconnect_schedule_source_v1(uuid) owner to postgres;
alter function public.corralio_archive_team_v1(uuid) owner to postgres;
alter function public.corralio_archive_child_v1(uuid) owner to postgres;
alter function public.corralio_update_schedule_source_assignment_v1(uuid, uuid, uuid) owner to postgres;

revoke all on function public.corralio_disconnect_schedule_source_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.corralio_archive_team_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.corralio_archive_child_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.corralio_update_schedule_source_assignment_v1(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.corralio_disconnect_schedule_source_v1(uuid)
  to authenticated, service_role;
grant execute on function public.corralio_archive_team_v1(uuid)
  to authenticated, service_role;
grant execute on function public.corralio_archive_child_v1(uuid)
  to authenticated, service_role;
grant execute on function public.corralio_update_schedule_source_assignment_v1(uuid, uuid, uuid)
  to authenticated, service_role;

comment on function public.corralio_disconnect_schedule_source_v1(uuid) is
  'Owner-authorized non-destructive schedule disconnect; stale, missing, and foreign targets return false.';
comment on function public.corralio_archive_team_v1(uuid) is
  'Owner-authorized active-team archival with atomic source/event unassignment; stale, missing, and foreign targets return false.';
comment on function public.corralio_archive_child_v1(uuid) is
  'Owner-authorized active-child/team archival with atomic source/event unassignment; stale, missing, and foreign targets return false.';
