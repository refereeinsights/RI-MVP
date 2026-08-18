-- Corralio Slice 3: atomic trusted persistence for normalized ICS events.
-- Apply manually in a controlled production migration. The application must not
-- call this boundary until it exists. No source URL is accepted or returned here.

create or replace function public.corralio_persist_ics_ingestion_v1(
  p_household_id uuid,
  p_source_id uuid,
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
  v_upserted_count integer := 0;
  v_canceled_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted schedule persistence is required' using errcode = '42501';
  end if;

  if p_household_id is null or p_source_id is null then
    raise exception 'Schedule source context is required' using errcode = '22023';
  end if;

  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'Normalized schedule events must be an array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_events) > 500 then
    raise exception 'Normalized schedule event limit exceeded' using errcode = '22023';
  end if;

  select source.*
    into v_source
  from public.corralio_schedule_sources source
  where source.id = p_source_id
    and source.household_id = p_household_id
    and source.source_type = 'ics'
    and source.sync_status <> 'disconnected'
  for update;

  if not found then
    raise exception 'Schedule source not found' using errcode = '23503';
  end if;

  delete from public.corralio_events event
  where event.household_id = p_household_id
    and event.schedule_source_id = p_source_id
    and event.origin_type = 'ics'
    and event.source_event_uid = any(coalesce(p_canceled_source_event_uids, '{}'::text[]));
  get diagnostics v_canceled_count = row_count;

  insert into public.corralio_events (
    household_id,
    origin_type,
    schedule_source_id,
    source_event_uid,
    title,
    starts_at,
    ends_at,
    timezone,
    child_id,
    team_id,
    source_location_text,
    display_location_text,
    field_label,
    notes
  )
  select
    p_household_id,
    'ics',
    p_source_id,
    incoming.source_event_uid,
    incoming.title,
    incoming.starts_at,
    incoming.ends_at,
    incoming.timezone,
    v_source.child_id,
    v_source.team_id,
    incoming.source_location_text,
    incoming.display_location_text,
    incoming.field_label,
    incoming.notes
  from jsonb_to_recordset(p_events) as incoming (
    title text,
    starts_at timestamptz,
    ends_at timestamptz,
    timezone text,
    source_event_uid text,
    source_location_text text,
    display_location_text text,
    field_label text,
    notes text
  )
  on conflict (household_id, schedule_source_id, source_event_uid)
    where origin_type = 'ics'
  do update set
    title = excluded.title,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    timezone = excluded.timezone,
    child_id = excluded.child_id,
    team_id = excluded.team_id,
    source_location_text = excluded.source_location_text,
    display_location_text = excluded.display_location_text,
    field_label = excluded.field_label,
    notes = excluded.notes,
    updated_at = now();
  get diagnostics v_upserted_count = row_count;

  update public.corralio_schedule_sources source
  set sync_status = 'success',
      last_synced_at = now()
  where source.id = p_source_id
    and source.household_id = p_household_id;

  return query select v_upserted_count, v_canceled_count;
end;
$function$;

revoke all on function public.corralio_persist_ics_ingestion_v1(uuid, uuid, jsonb, text[])
  from public, anon, authenticated;
grant execute on function public.corralio_persist_ics_ingestion_v1(uuid, uuid, jsonb, text[])
  to service_role;

comment on function public.corralio_persist_ics_ingestion_v1(uuid, uuid, jsonb, text[]) is
  'Service-role-only atomic persistence of already-fetched and normalized Corralio ICS events. Accepts no source URL.';
