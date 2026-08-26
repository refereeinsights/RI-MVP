-- Corralio Slice 4.6: private schedule-aware Food/Coffee recommendations.
-- Apply manually. This migration adds only household arrival preferences,
-- typed ICS arrival provenance, sanitized analytics, and routing audit vocabulary.

alter table public.corralio_teams
  add column arrival_buffer_minutes smallint null,
  add constraint corralio_teams_arrival_buffer_check
    check (
      arrival_buffer_minutes is null
      or (arrival_buffer_minutes between 0 and 120 and arrival_buffer_minutes % 5 = 0)
    );

comment on column public.corralio_teams.arrival_buffer_minutes is
  'Optional household-private all-events team arrival preference; exact schedule arrival remains authoritative.';

alter table public.corralio_events
  add column schedule_arrival_at timestamptz null,
  add constraint corralio_events_schedule_arrival_check
    check (
      schedule_arrival_at is null
      or (
        origin_type = 'ics'
        and schedule_arrival_at <= starts_at
        and schedule_arrival_at >= starts_at - interval '180 minutes'
      )
    );

comment on column public.corralio_events.schedule_arrival_at is
  'Exact, deterministically parsed ICS Arrival Time/Arrival clock; null for ambiguous or unsupported schedule prose.';

alter table public.corralio_external_api_calls
  drop constraint corralio_external_api_calls_operation_check,
  add constraint corralio_external_api_calls_operation_check
    check (operation in ('geocode_origin', 'geocode_event', 'route_event', 'route_what_fits'));

create table public.corralio_what_fits_events (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.corralio_households(id) on delete cascade,
  event_name text not null,
  mode text null,
  reason text null,
  arrival_source text null,
  result_count smallint null,
  candidate_position smallint null,
  occurred_at timestamptz not null default now(),
  constraint corralio_what_fits_events_name_check check (event_name in (
    'eligible_gap_identified', 'what_fits_surfaced', 'what_fits_viewed',
    'mode_selected', 'candidate_shown', 'candidate_selected', 'directions_started',
    'see_more_opened', 'no_fit', 'what_fits_suppressed', 'arrival_setting_changed'
  )),
  constraint corralio_what_fits_events_mode_check check (mode is null or mode in ('food', 'coffee')),
  constraint corralio_what_fits_events_reason_check check (reason is null or reason in (
    'below_minimum_gap', 'household_conflict', 'missing_end', 'missing_venue',
    'no_candidate_pool', 'routing_unavailable', 'quota_exhausted', 'no_candidate_fit'
  )),
  constraint corralio_what_fits_events_arrival_check check (
    arrival_source is null or arrival_source in ('ics_explicit', 'team_preference', 'corralio_default')
  ),
  constraint corralio_what_fits_events_result_check check (result_count is null or result_count between 0 and 10),
  constraint corralio_what_fits_events_position_check check (candidate_position is null or candidate_position between 1 and 10)
);

create index corralio_what_fits_events_household_time_idx
  on public.corralio_what_fits_events (household_id, occurred_at desc);
create index corralio_what_fits_events_name_time_idx
  on public.corralio_what_fits_events (event_name, occurred_at desc);

comment on table public.corralio_what_fits_events is
  'Household-private bounded What Fits funnel events; contains no event text, child/team identity, address, coordinates, or route endpoint.';

alter table public.corralio_what_fits_events enable row level security;
alter table public.corralio_what_fits_events force row level security;
revoke all on table public.corralio_what_fits_events from public, anon, authenticated;
grant select, insert on table public.corralio_what_fits_events to service_role;

create function public.corralio_record_what_fits_event_v1(
  p_event_name text,
  p_mode text default null,
  p_reason text default null,
  p_arrival_source text default null,
  p_result_count integer default null,
  p_candidate_position integer default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_household_id uuid;
begin
  if auth.uid() is null then return; end if;

  select member.household_id into v_household_id
  from public.corralio_household_members member
  where member.user_id = auth.uid()
    and member.role = 'owner'
    and member.status = 'active'
  limit 1;
  if v_household_id is null then return; end if;

  insert into public.corralio_what_fits_events (
    household_id, event_name, mode, reason, arrival_source, result_count, candidate_position
  ) values (
    v_household_id,
    lower(btrim(coalesce(p_event_name, ''))),
    case when p_mode is null then null else lower(btrim(p_mode)) end,
    case when p_reason is null then null else lower(btrim(p_reason)) end,
    case when p_arrival_source is null then null else lower(btrim(p_arrival_source)) end,
    p_result_count,
    p_candidate_position
  );
end;
$function$;

revoke all on function public.corralio_record_what_fits_event_v1(text,text,text,text,integer,integer)
  from public, anon;
grant execute on function public.corralio_record_what_fits_event_v1(text,text,text,text,integer,integer)
  to authenticated, service_role;
alter function public.corralio_record_what_fits_event_v1(text,text,text,text,integer,integer)
  owner to postgres;

comment on function public.corralio_record_what_fits_event_v1(text,text,text,text,integer,integer) is
  'Authenticated-owner-only insertion of one bounded privacy-safe What Fits analytics event.';

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

  select source.* into v_source
  from public.corralio_schedule_sources source
  where source.id = p_source_id
    and source.household_id = p_household_id
    and source.source_type = 'ics'
    and source.sync_status <> 'disconnected'
  for update;
  if not found then raise exception 'Schedule source not found' using errcode = '23503'; end if;

  delete from public.corralio_events event
  where event.household_id = p_household_id
    and event.schedule_source_id = p_source_id
    and event.origin_type = 'ics'
    and event.source_event_uid = any(coalesce(p_canceled_source_event_uids, '{}'::text[]));
  get diagnostics v_canceled_count = row_count;

  insert into public.corralio_events (
    household_id, origin_type, schedule_source_id, source_event_uid,
    title, starts_at, ends_at, timezone, child_id, team_id,
    source_location_text, display_location_text, field_label, notes, schedule_arrival_at
  )
  select
    p_household_id, 'ics', p_source_id, incoming.source_event_uid,
    incoming.title, incoming.starts_at, incoming.ends_at, incoming.timezone,
    v_source.child_id, v_source.team_id,
    incoming.source_location_text, incoming.display_location_text,
    incoming.field_label, incoming.notes, incoming.schedule_arrival_at
  from jsonb_to_recordset(p_events) as incoming (
    title text,
    starts_at timestamptz,
    ends_at timestamptz,
    timezone text,
    source_event_uid text,
    source_location_text text,
    display_location_text text,
    field_label text,
    notes text,
    schedule_arrival_at timestamptz
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
    schedule_arrival_at = excluded.schedule_arrival_at,
    updated_at = now();
  get diagnostics v_upserted_count = row_count;

  update public.corralio_schedule_sources source
  set sync_status = 'success',
      last_synced_at = now(),
      consecutive_refresh_failures = 0,
      refresh_paused_at = null,
      last_refresh_error_code = null
  where source.id = p_source_id and source.household_id = p_household_id;

  return query select v_upserted_count, v_canceled_count;
end;
$function$;

revoke all on function public.corralio_persist_ics_ingestion_v1(uuid,uuid,jsonb,text[])
  from public, anon, authenticated;
grant execute on function public.corralio_persist_ics_ingestion_v1(uuid,uuid,jsonb,text[])
  to service_role;
alter function public.corralio_persist_ics_ingestion_v1(uuid,uuid,jsonb,text[])
  owner to postgres;

comment on function public.corralio_persist_ics_ingestion_v1(uuid,uuid,jsonb,text[]) is
  'Service-only atomic ICS persistence including bounded deterministic schedule arrival provenance.';
