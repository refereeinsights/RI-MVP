-- Rollback-only behavior verification for 20260903_ti_hotel_booking_sync_runs.sql.
-- Uses a fixed, future fixture window and leaves zero retained rows.

do $precheck$
begin
  if exists (
    select 1 from public.ti_hotel_booking_sync_runs
    where purchase_window_start >= '2099-09-03 00:00:00+00'::timestamptz
      and purchase_window_end < '2099-09-04 00:00:00+00'::timestamptz
  ) then raise exception 'heartbeat behavioral blocked: fixture namespace not empty'; end if;
end
$precheck$;

begin;
set local role service_role;

do $behavior$
declare
  v_success uuid;
  v_partial uuid;
  v_health record;
begin
  v_success := public.ti_start_hotel_booking_sync_run_v1(
    'manual_operator', '2099-09-03 01:00:00+00', '2099-09-03 02:00:00+00'
  );
  if not public.ti_finalize_hotel_booking_sync_run_v1(
    v_success, 'succeeded', 1, 0, 1, 0, 0, 0, null
  ) then raise exception 'heartbeat behavioral failed: success finalization'; end if;
  if public.ti_finalize_hotel_booking_sync_run_v1(
    v_success, 'failed', 1, 0, 0, 0, 0, 0, 'provider_request'
  ) then raise exception 'heartbeat behavioral failed: terminal mutation'; end if;

  v_partial := public.ti_start_hotel_booking_sync_run_v1(
    'vercel_cron', '2099-09-03 03:00:00+00', '2099-09-03 04:00:00+00'
  );
  if not public.ti_finalize_hotel_booking_sync_run_v1(
    v_partial, 'partial', 1, 3, 1, 0, 2, 1, 'cancellation_download'
  ) then raise exception 'heartbeat behavioral failed: partial finalization'; end if;

  select * into v_health from public.ti_read_hotel_booking_sync_health_v1();
  if v_health.last_attempt_id is null
     or v_health.last_terminal_completed_at is null
     or v_health.last_successful_completed_at is null
  then raise exception 'heartbeat behavioral failed: bounded health read'; end if;

  begin
    perform public.ti_start_hotel_booking_sync_run_v1(
      'caller_supplied', '2099-09-03 05:00:00+00', '2099-09-03 06:00:00+00'
    );
    raise exception 'heartbeat behavioral failed: open trigger vocabulary';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.ti_finalize_hotel_booking_sync_run_v1(
      v_partial, 'succeeded', 1, 0, 1, 0, 0, 0, 'provider_request'
    );
    raise exception 'heartbeat behavioral failed: success with error accepted';
  exception when sqlstate '22023' then null;
  end;
end
$behavior$;

reset role;

do $state$
begin
  if (select count(*) from public.ti_hotel_booking_sync_runs
      where purchase_window_start >= '2099-09-03 00:00:00+00'::timestamptz
        and purchase_window_end < '2099-09-04 00:00:00+00'::timestamptz) <> 2
  then raise exception 'heartbeat behavioral failed: transaction state'; end if;
  if exists (
    select 1 from public.ti_hotel_booking_sync_runs
    where purchase_window_start >= '2099-09-03 00:00:00+00'::timestamptz
      and (status = 'running' or completed_at is null)
  ) then raise exception 'heartbeat behavioral failed: incomplete terminal state'; end if;
end
$state$;

rollback;

do $cleanup$
begin
  if exists (
    select 1 from public.ti_hotel_booking_sync_runs
    where purchase_window_start >= '2099-09-03 00:00:00+00'::timestamptz
      and purchase_window_end < '2099-09-04 00:00:00+00'::timestamptz
  ) then raise exception 'heartbeat behavioral failed: rollback cleanup nonzero'; end if;
end
$cleanup$;

select 'TI HOTEL BOOKING SYNC HEARTBEAT BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO'
  as ti_hotel_booking_sync_heartbeat_behavioral_verification;
