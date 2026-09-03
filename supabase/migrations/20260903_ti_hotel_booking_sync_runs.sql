-- TI HotelPlanner booking-sync heartbeat.
-- Aggregate operational state only; no booking identifiers, provider payloads, or PII.
-- Do not apply automatically: production database is live.

create extension if not exists pgcrypto;

create table public.ti_hotel_booking_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'partial', 'failed')),
  trigger_type text not null
    check (trigger_type in ('vercel_cron', 'manual_operator')),
  purchase_window_start timestamptz not null,
  purchase_window_end timestamptz not null,
  purchase_provider_calls integer not null default 0 check (purchase_provider_calls between 0 and 1),
  purchase_rows_returned integer not null default 0 check (purchase_rows_returned >= 0),
  cancellation_provider_calls integer not null default 0 check (cancellation_provider_calls between 0 and 1),
  cancellation_rows_returned integer not null default 0 check (cancellation_rows_returned >= 0),
  rows_upserted integer not null default 0 check (rows_upserted >= 0),
  rows_failed integer not null default 0 check (rows_failed >= 0),
  error_stage text check (error_stage in (
    'provider_request',
    'report_download',
    'report_parse',
    'purchase_upsert',
    'cancellation_request',
    'cancellation_download',
    'cancellation_parse',
    'cancellation_upsert',
    'heartbeat_persistence'
  )),
  created_at timestamptz not null default clock_timestamp(),
  constraint ti_hotel_booking_sync_runs_window_check
    check (purchase_window_end >= purchase_window_start),
  constraint ti_hotel_booking_sync_runs_terminal_check
    check (
      (status = 'running' and completed_at is null)
      or (status in ('succeeded', 'partial', 'failed') and completed_at is not null)
    ),
  constraint ti_hotel_booking_sync_runs_success_error_check
    check (status <> 'succeeded' or error_stage is null)
);

create index ti_hotel_booking_sync_runs_started_at_idx
  on public.ti_hotel_booking_sync_runs (started_at desc);

create index ti_hotel_booking_sync_runs_success_idx
  on public.ti_hotel_booking_sync_runs (completed_at desc)
  where status = 'succeeded';

alter table public.ti_hotel_booking_sync_runs owner to postgres;
alter table public.ti_hotel_booking_sync_runs enable row level security;
alter table public.ti_hotel_booking_sync_runs force row level security;

revoke all on table public.ti_hotel_booking_sync_runs from public, anon, authenticated, service_role;

create or replace function public.ti_start_hotel_booking_sync_run_v1(
  p_trigger text,
  p_purchase_window_start timestamptz,
  p_purchase_window_end timestamptz
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if p_trigger is null or p_trigger not in ('vercel_cron', 'manual_operator') then
    raise exception 'invalid sync trigger' using errcode = '22023';
  end if;
  if p_purchase_window_start is null or p_purchase_window_end is null
     or p_purchase_window_end < p_purchase_window_start then
    raise exception 'invalid purchase window' using errcode = '22023';
  end if;

  insert into public.ti_hotel_booking_sync_runs (
    trigger_type, purchase_window_start, purchase_window_end
  ) values (
    p_trigger, p_purchase_window_start, p_purchase_window_end
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.ti_finalize_hotel_booking_sync_run_v1(
  p_run_id uuid,
  p_status text,
  p_purchase_provider_calls integer,
  p_purchase_rows_returned integer,
  p_cancellation_provider_calls integer,
  p_cancellation_rows_returned integer,
  p_rows_upserted integer,
  p_rows_failed integer,
  p_error_stage text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_run_id is null or p_status is null or p_status not in ('succeeded', 'partial', 'failed') then
    raise exception 'invalid terminal sync state' using errcode = '22023';
  end if;
  if p_purchase_provider_calls is null or p_purchase_provider_calls not between 0 and 1
     or p_cancellation_provider_calls is null or p_cancellation_provider_calls not between 0 and 1
     or p_purchase_rows_returned is null or p_purchase_rows_returned < 0
     or p_cancellation_rows_returned is null or p_cancellation_rows_returned < 0
     or p_rows_upserted is null or p_rows_upserted < 0
     or p_rows_failed is null or p_rows_failed < 0 then
    raise exception 'invalid sync counters' using errcode = '22023';
  end if;
  if p_error_stage is not null and p_error_stage not in (
    'provider_request', 'report_download', 'report_parse', 'purchase_upsert',
    'cancellation_request', 'cancellation_download', 'cancellation_parse',
    'cancellation_upsert', 'heartbeat_persistence'
  ) then
    raise exception 'invalid sync error stage' using errcode = '22023';
  end if;
  if p_status = 'succeeded' and p_error_stage is not null then
    raise exception 'successful sync cannot have an error stage' using errcode = '22023';
  end if;

  update public.ti_hotel_booking_sync_runs
     set status = p_status,
         completed_at = clock_timestamp(),
         purchase_provider_calls = p_purchase_provider_calls,
         purchase_rows_returned = p_purchase_rows_returned,
         cancellation_provider_calls = p_cancellation_provider_calls,
         cancellation_rows_returned = p_cancellation_rows_returned,
         rows_upserted = p_rows_upserted,
         rows_failed = p_rows_failed,
         error_stage = p_error_stage
   where id = p_run_id
     and status = 'running'
     and completed_at is null;

  return found;
end;
$$;

create or replace function public.ti_read_hotel_booking_sync_health_v1()
returns table (
  last_attempt_id uuid,
  last_attempt_started_at timestamptz,
  last_attempt_completed_at timestamptz,
  last_attempt_status text,
  last_attempt_trigger text,
  last_attempt_purchase_rows integer,
  last_attempt_cancellation_rows integer,
  last_attempt_rows_upserted integer,
  last_attempt_rows_failed integer,
  last_attempt_error_stage text,
  last_terminal_completed_at timestamptz,
  last_terminal_status text,
  last_successful_completed_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with last_attempt as (
    select r.*
    from public.ti_hotel_booking_sync_runs r
    order by r.started_at desc, r.id desc
    limit 1
  ), last_terminal as (
    select r.*
    from public.ti_hotel_booking_sync_runs r
    where r.status <> 'running'
    order by r.completed_at desc, r.id desc
    limit 1
  ), last_success as (
    select r.*
    from public.ti_hotel_booking_sync_runs r
    where r.status = 'succeeded'
    order by r.completed_at desc, r.id desc
    limit 1
  )
  select
    a.id,
    a.started_at,
    a.completed_at,
    a.status,
    a.trigger_type,
    a.purchase_rows_returned,
    a.cancellation_rows_returned,
    a.rows_upserted,
    a.rows_failed,
    a.error_stage,
    t.completed_at,
    t.status,
    s.completed_at
  from (select 1) anchor
  left join last_attempt a on true
  left join last_terminal t on true
  left join last_success s on true;
$$;

alter function public.ti_start_hotel_booking_sync_run_v1(text, timestamptz, timestamptz) owner to postgres;
alter function public.ti_finalize_hotel_booking_sync_run_v1(uuid, text, integer, integer, integer, integer, integer, integer, text) owner to postgres;
alter function public.ti_read_hotel_booking_sync_health_v1() owner to postgres;

revoke all on function public.ti_start_hotel_booking_sync_run_v1(text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.ti_finalize_hotel_booking_sync_run_v1(uuid, text, integer, integer, integer, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.ti_read_hotel_booking_sync_health_v1() from public, anon, authenticated;

grant execute on function public.ti_start_hotel_booking_sync_run_v1(text, timestamptz, timestamptz) to service_role;
grant execute on function public.ti_finalize_hotel_booking_sync_run_v1(uuid, text, integer, integer, integer, integer, integer, integer, text) to service_role;
grant execute on function public.ti_read_hotel_booking_sync_health_v1() to service_role;

comment on table public.ti_hotel_booking_sync_runs is
  'Aggregate service-only HotelPlanner booking-sync heartbeat; contains no booking identifiers or customer data.';
