-- Corralio Slice 3.3: persistent scheduled-refresh failure and recovery.
-- Apply manually in a controlled production migration. This migration does
-- not fetch calendar URLs, invoke cron, or modify imported events by itself.

alter table public.corralio_schedule_sources
  add column if not exists consecutive_refresh_failures integer not null default 0,
  add column if not exists refresh_paused_at timestamptz null;

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.corralio_schedule_sources'::regclass
      and conname = 'corralio_schedule_sources_refresh_failure_count_check'
  ) then
    alter table public.corralio_schedule_sources
      add constraint corralio_schedule_sources_refresh_failure_count_check
      check (consecutive_refresh_failures between 0 and 3);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.corralio_schedule_sources'::regclass
      and conname = 'corralio_schedule_sources_refresh_pause_state_check'
  ) then
    alter table public.corralio_schedule_sources
      add constraint corralio_schedule_sources_refresh_pause_state_check
      check (
        (consecutive_refresh_failures between 0 and 2 and refresh_paused_at is null)
        or (consecutive_refresh_failures = 3 and refresh_paused_at is not null)
      );
  end if;
end;
$block$;

comment on column public.corralio_schedule_sources.consecutive_refresh_failures is
  'Consecutive accepted scheduled-refresh failures, saturated at the fixed Slice 3.3 threshold of 3.';
comment on column public.corralio_schedule_sources.refresh_paused_at is
  'Set when 3 consecutive accepted failures pause normal cron refresh; cleared only by successful canonical persistence.';
comment on column public.corralio_schedule_sources.last_refresh_attempted_at is
  'Last trusted refresh attempt time from a scheduled claim or successful validated URL replacement; enforces the 23-hour freshness window.';

-- The browser needs only the pause marker to distinguish retrying from needs
-- attention. The exact counter remains trusted operational metadata.
grant select (refresh_paused_at)
  on table public.corralio_schedule_sources to authenticated;

create or replace function public.corralio_claim_ics_refresh_batch_v1(
  p_limit integer default 10
)
returns table (
  source_id uuid,
  household_id uuid,
  source_url text,
  claim_token uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 10);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted schedule refresh is required' using errcode = '42501';
  end if;

  return query
  with candidates as materialized (
    select source.id
    from public.corralio_schedule_sources source
    where source.source_type = 'ics'
      and source.sync_status in ('pending', 'success', 'error')
      and source.refresh_paused_at is null
      and length(btrim(source.source_url)) > 0
      and (
        (
          source.refresh_claim_token is null
          and (
            source.last_refresh_attempted_at is null
            or source.last_refresh_attempted_at <= now() - interval '23 hours'
          )
        )
        or (
          source.refresh_claim_token is not null
          and source.refresh_claimed_at <= now() - interval '10 minutes'
        )
      )
    order by source.last_refresh_attempted_at asc nulls first, source.id asc
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.corralio_schedule_sources source
    set refresh_claim_token = gen_random_uuid(),
        refresh_claimed_at = now(),
        last_refresh_attempted_at = now()
    from candidates
    where source.id = candidates.id
    returning source.id, source.household_id, source.source_url, source.refresh_claim_token
  )
  select claimed.id, claimed.household_id, claimed.source_url, claimed.refresh_claim_token
  from claimed
  order by claimed.id asc;
end;
$function$;

-- Canonical successful ingestion remains the single success state boundary for
-- initial imports, scheduled refresh, valid-empty refresh, and URL replacement.
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
      last_synced_at = now(),
      consecutive_refresh_failures = 0,
      refresh_paused_at = null,
      last_refresh_error_code = null
  where source.id = p_source_id
    and source.household_id = p_household_id;

  return query select v_upserted_count, v_canceled_count;
end;
$function$;

create or replace function public.corralio_fail_claimed_ics_refresh_v1(
  p_source_id uuid,
  p_claim_token uuid,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_failure_code text := lower(btrim(coalesce(p_failure_code, '')));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted schedule refresh is required' using errcode = '42501';
  end if;

  if v_failure_code not in (
    'invalid_url', 'unsupported_protocol', 'private_url', 'fetch_failed',
    'not_ics', 'too_large', 'event_limit', 'persistence'
  ) then
    raise exception 'Schedule refresh failure code is invalid' using errcode = '22023';
  end if;

  update public.corralio_schedule_sources source
  set sync_status = 'error',
      last_refresh_error_code = v_failure_code,
      consecutive_refresh_failures = least(source.consecutive_refresh_failures + 1, 3),
      refresh_paused_at = case
        when source.consecutive_refresh_failures >= 2 then coalesce(source.refresh_paused_at, now())
        else null
      end,
      refresh_claim_token = null,
      refresh_claimed_at = null
  where source.id = p_source_id
    and source.source_type = 'ics'
    and source.sync_status in ('pending', 'success', 'error')
    and source.refresh_paused_at is null
    and source.refresh_claim_token = p_claim_token
    and source.refresh_claimed_at > now() - interval '10 minutes';

  return found;
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
    raise exception 'Schedule source not found' using errcode = '23503';
  end if;

  update public.corralio_schedule_sources source
  set source_url = p_source_url
  where source.id = p_source_id
    and source.household_id = p_household_id;

  return query
  select result.upserted_count, result.canceled_count
  from public.corralio_persist_ics_ingestion_v1(
    p_household_id,
    p_source_id,
    p_events,
    coalesce(p_canceled_source_event_uids, '{}'::text[])
  ) result;

  -- A validated replacement is itself a successful trusted refresh. Keep this
  -- in the same transaction so a failed replacement preserves the prior time.
  update public.corralio_schedule_sources source
  set last_refresh_attempted_at = now()
  where source.id = p_source_id
    and source.household_id = p_household_id;
end;
$function$;

revoke all on function public.corralio_claim_ics_refresh_batch_v1(integer)
  from public, anon, authenticated;
revoke all on function public.corralio_persist_ics_ingestion_v1(uuid, uuid, jsonb, text[])
  from public, anon, authenticated;
revoke all on function public.corralio_fail_claimed_ics_refresh_v1(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.corralio_replace_schedule_source_and_persist_ics_v1(uuid, uuid, text, jsonb, text[])
  from public, anon, authenticated;

grant execute on function public.corralio_claim_ics_refresh_batch_v1(integer)
  to service_role;
grant execute on function public.corralio_persist_ics_ingestion_v1(uuid, uuid, jsonb, text[])
  to service_role;
grant execute on function public.corralio_fail_claimed_ics_refresh_v1(uuid, uuid, text)
  to service_role;
grant execute on function public.corralio_replace_schedule_source_and_persist_ics_v1(uuid, uuid, text, jsonb, text[])
  to service_role;

comment on function public.corralio_claim_ics_refresh_batch_v1(integer) is
  'Service-role-only deterministic claim of at most 10 unpaused ICS sources using 23-hour freshness and 10-minute claim recovery.';
comment on function public.corralio_persist_ics_ingestion_v1(uuid, uuid, jsonb, text[]) is
  'Service-role-only canonical ICS persistence; successful ingestion resets persistent refresh failure state and returns no source URL.';
comment on function public.corralio_fail_claimed_ics_refresh_v1(uuid, uuid, text) is
  'Service-role-only claimed failure finalization; atomically saturates at 3 failures, pauses cron eligibility, and preserves URL/events.';
comment on function public.corralio_replace_schedule_source_and_persist_ics_v1(uuid, uuid, text, jsonb, text[]) is
  'Service-role-only atomic validated URL replacement and canonical persistence; successful replacement resets failure state and refresh freshness.';
