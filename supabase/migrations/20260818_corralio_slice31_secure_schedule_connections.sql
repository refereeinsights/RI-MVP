-- Corralio Slice 3.1: source-level sport metadata and atomic secret URL replacement.
-- Apply manually in a controlled production migration. This migration creates no
-- jobs and performs no external calendar fetches.

alter table public.corralio_schedule_sources
  add column if not exists sport text null;

alter table public.corralio_schedule_sources
  add constraint corralio_schedule_sources_sport_check
  check (
    sport is null
    or sport in (
      'baseball',
      'softball',
      'soccer',
      'basketball',
      'volleyball',
      'hockey',
      'lacrosse',
      'football',
      'other'
    )
  );

comment on column public.corralio_schedule_sources.sport is
  'Optional Corralio source-level sport context. Imported event rows derive sport through schedule_source_id.';

grant select (sport) on table public.corralio_schedule_sources to authenticated;

create or replace function public.corralio_create_schedule_source_v2(
  p_household_id uuid,
  p_display_name text,
  p_source_url text,
  p_sport text default null,
  p_child_id uuid default null,
  p_team_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_source_id uuid;
  v_sport text := nullif(lower(btrim(p_sport)), '');
begin
  if v_sport is not null and v_sport not in (
    'baseball', 'softball', 'soccer', 'basketball', 'volleyball',
    'hockey', 'lacrosse', 'football', 'other'
  ) then
    raise exception 'Schedule source sport is invalid' using errcode = '22023';
  end if;

  -- Reuse the reviewed V1 authorization, URL validation, assignment validation,
  -- and insertion boundary instead of maintaining a second implementation.
  v_source_id := public.corralio_create_schedule_source(
    p_household_id,
    p_display_name,
    p_source_url,
    p_child_id,
    p_team_id
  );

  update public.corralio_schedule_sources source
  set sport = v_sport
  where source.id = v_source_id;

  return v_source_id;
end;
$function$;

create or replace function public.corralio_update_schedule_source_sport_v1(
  p_source_id uuid,
  p_sport text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_sport text := nullif(lower(btrim(p_sport)), '');
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if v_sport is not null and v_sport not in (
    'baseball', 'softball', 'soccer', 'basketball', 'volleyball',
    'hockey', 'lacrosse', 'football', 'other'
  ) then
    raise exception 'Schedule source sport is invalid' using errcode = '22023';
  end if;

  update public.corralio_schedule_sources source
  set sport = v_sport
  where source.id = p_source_id
    and source.source_type = 'ics'
    and source.sync_status in ('pending', 'success', 'error')
    and exists (
      select 1
      from public.corralio_household_members member
      where member.household_id = source.household_id
        and member.user_id = v_user_id
        and member.role = 'owner'
        and member.status = 'active'
    );

  if not found then
    raise exception 'Schedule source not found or access denied' using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.corralio_replace_schedule_source_and_persist_ics_v1(
  p_household_id uuid,
  p_source_id uuid,
  p_source_url text,
  p_events jsonb,
  p_canceled_source_event_uids text[] default '{}'::text[]
)
returns table (upserted_count integer, canceled_count integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_source public.corralio_schedule_sources%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted schedule replacement is required' using errcode = '42501';
  end if;

  if p_household_id is null or p_source_id is null then
    raise exception 'Schedule source context is required' using errcode = '22023';
  end if;

  if p_source_url is null
     or length(p_source_url) not between 1 and 2000
     or p_source_url !~* '^https?://' then
    raise exception 'Schedule source URL is invalid' using errcode = '22023';
  end if;

  select source.*
    into v_source
  from public.corralio_schedule_sources source
  where source.id = p_source_id
    and source.household_id = p_household_id
    and source.source_type = 'ics'
    and source.sync_status in ('pending', 'success', 'error')
  for update;

  if not found then
    -- Deliberately identical for missing, disconnected, non-ICS, and wrong-household IDs.
    raise exception 'Schedule source not found' using errcode = '23503';
  end if;

  update public.corralio_schedule_sources source
  set source_url = p_source_url
  where source.id = p_source_id
    and source.household_id = p_household_id;

  -- Delegate event upsert, explicit-cancellation deletion, assignment copying,
  -- and sync timestamps to the existing canonical persistence function. Any
  -- exception rolls back this function's URL update in the same transaction.
  return query
  select result.upserted_count, result.canceled_count
  from public.corralio_persist_ics_ingestion_v1(
    p_household_id,
    p_source_id,
    p_events,
    coalesce(p_canceled_source_event_uids, '{}'::text[])
  ) result;
end;
$function$;

revoke all on function public.corralio_create_schedule_source_v2(uuid, text, text, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.corralio_update_schedule_source_sport_v1(uuid, text)
  from public, anon, authenticated;
revoke all on function public.corralio_replace_schedule_source_and_persist_ics_v1(uuid, uuid, text, jsonb, text[])
  from public, anon, authenticated;

grant execute on function public.corralio_create_schedule_source_v2(uuid, text, text, text, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.corralio_update_schedule_source_sport_v1(uuid, text)
  to authenticated, service_role;
grant execute on function public.corralio_replace_schedule_source_and_persist_ics_v1(uuid, uuid, text, jsonb, text[])
  to service_role;

-- The V1 direct URL-write boundary is retained for compatibility but is no
-- longer available to ordinary clients. Replacement now requires trusted fetch,
-- normalization, and atomic persistence through the server-only V1 boundary.
revoke execute on function public.corralio_replace_schedule_source_url(uuid, text)
  from authenticated;

comment on function public.corralio_create_schedule_source_v2(uuid, text, text, text, uuid, uuid) is
  'Authorized source creation with optional bounded Corralio sport metadata; returns only the source ID.';
comment on function public.corralio_update_schedule_source_sport_v1(uuid, text) is
  'Owner-authorized source-level sport update for an active household ICS source.';
comment on function public.corralio_replace_schedule_source_and_persist_ics_v1(uuid, uuid, text, jsonb, text[]) is
  'Service-role-only atomic replacement of a secret source URL plus canonical ICS persistence. Fetch and normalization occur before this transaction.';
