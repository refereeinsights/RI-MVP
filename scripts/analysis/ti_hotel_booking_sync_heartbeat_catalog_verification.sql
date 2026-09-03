-- Read-only catalog verification for 20260903_ti_hotel_booking_sync_runs.sql.

do $verify$
declare
  v_start oid := 'public.ti_start_hotel_booking_sync_run_v1(text,timestamp with time zone,timestamp with time zone)'::regprocedure;
  v_finalize oid := 'public.ti_finalize_hotel_booking_sync_run_v1(uuid,text,integer,integer,integer,integer,integer,integer,text)'::regprocedure;
  v_read oid := 'public.ti_read_hotel_booking_sync_health_v1()'::regprocedure;
begin
  if not exists (
    select 1
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'ti_hotel_booking_sync_runs'
      and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity
  ) then raise exception 'heartbeat catalog failed: forced RLS'; end if;

  if (select c.relowner from pg_class c where c.oid = 'public.ti_hotel_booking_sync_runs'::regclass) <> 'postgres'::regrole
  then raise exception 'heartbeat catalog failed: table owner'; end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'ti_hotel_booking_sync_runs'
      and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ) then raise exception 'heartbeat catalog failed: direct table grant'; end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ti_hotel_booking_sync_runs'
      and column_name ~ '(itinerary|confirmation|customer|email|phone|url|payload|secret|user_agent|message)'
  ) then raise exception 'heartbeat catalog failed: sensitive column'; end if;

  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'ti_hotel_booking_sync_runs'
        and column_name in (
          'id','started_at','completed_at','status','trigger_type','purchase_window_start','purchase_window_end',
          'purchase_provider_calls','purchase_rows_returned','cancellation_provider_calls',
          'cancellation_rows_returned','rows_upserted','rows_failed','error_stage','created_at'
        )) <> 15
  then raise exception 'heartbeat catalog failed: required columns'; end if;

  if (select count(*) from pg_constraint
      where conrelid = 'public.ti_hotel_booking_sync_runs'::regclass
        and conname in (
          'ti_hotel_booking_sync_runs_status_check',
          'ti_hotel_booking_sync_runs_trigger_type_check',
          'ti_hotel_booking_sync_runs_error_stage_check',
          'ti_hotel_booking_sync_runs_window_check',
          'ti_hotel_booking_sync_runs_terminal_check',
          'ti_hotel_booking_sync_runs_success_error_check'
        )) <> 6
  then raise exception 'heartbeat catalog failed: closed constraints'; end if;

  if exists (
    select 1 from pg_proc
    where oid in (v_start, v_finalize, v_read)
      and (not prosecdef or proowner <> 'postgres'::regrole
        or proconfig is null or not (proconfig @> array['search_path=pg_catalog, public']))
  ) then raise exception 'heartbeat catalog failed: function security'; end if;

  if exists (
    select 1 from pg_proc p,
      lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid in (v_start, v_finalize, v_read)
      and acl.privilege_type = 'EXECUTE'
      and (acl.grantee = 0 or acl.grantee in ('anon'::regrole, 'authenticated'::regrole))
  ) then raise exception 'heartbeat catalog failed: untrusted execute'; end if;

  if not has_function_privilege('service_role', v_start, 'EXECUTE')
     or not has_function_privilege('service_role', v_finalize, 'EXECUTE')
     or not has_function_privilege('service_role', v_read, 'EXECUTE')
  then raise exception 'heartbeat catalog failed: service execute'; end if;

  if position('and status = ''running''' in lower(pg_get_functiondef(v_finalize))) = 0
     or position('clock_timestamp()' in lower(pg_get_functiondef(v_finalize))) = 0
  then raise exception 'heartbeat catalog failed: atomic terminal boundary'; end if;
end
$verify$;

select 'TI HOTEL BOOKING SYNC HEARTBEAT CATALOG VERIFICATION PASSED' as ti_hotel_booking_sync_heartbeat_catalog_verification;
