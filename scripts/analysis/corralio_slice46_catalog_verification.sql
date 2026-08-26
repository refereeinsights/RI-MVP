-- Read-only Slice 4.6 catalog verification. Run after a human applies the migration.
do $verify$
declare
  v_analytics regclass := to_regclass('public.corralio_what_fits_events');
  v_writer oid := to_regprocedure('public.corralio_record_what_fits_event_v1(text,text,text,text,integer,integer)');
  v_persist oid := to_regprocedure('public.corralio_persist_ics_ingestion_v1(uuid,uuid,jsonb,text[])');
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'corralio_teams'
      and column_name = 'arrival_buffer_minutes' and is_nullable = 'YES'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'corralio_events'
      and column_name = 'schedule_arrival_at' and is_nullable = 'YES'
  ) then raise exception 'Slice 4.6 catalog verification failed: arrival columns'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.corralio_teams'::regclass
      and conname = 'corralio_teams_arrival_buffer_check' and convalidated
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.corralio_events'::regclass
      and conname = 'corralio_events_schedule_arrival_check' and convalidated
  ) then raise exception 'Slice 4.6 catalog verification failed: arrival constraints'; end if;

  if v_analytics is null or exists (
    select 1 from pg_class
    where oid = v_analytics and (
      not relrowsecurity or not relforcerowsecurity or relowner <> 'postgres'::regrole
    )
  ) then raise exception 'Slice 4.6 catalog verification failed: analytics RLS'; end if;

  if exists (
    select 1 from pg_policy where polrelid = v_analytics
  ) then raise exception 'Slice 4.6 catalog verification failed: analytics policy surface'; end if;

  if has_table_privilege('public', v_analytics, 'SELECT')
     or has_table_privilege('anon', v_analytics, 'SELECT')
     or has_table_privilege('authenticated', v_analytics, 'SELECT')
     or has_table_privilege('authenticated', v_analytics, 'INSERT')
     or not has_table_privilege('service_role', v_analytics, 'SELECT')
     or not has_table_privilege('service_role', v_analytics, 'INSERT')
  then raise exception 'Slice 4.6 catalog verification failed: analytics grants'; end if;

  if v_writer is null or v_persist is null
     or exists (
       select 1 from pg_proc
       where oid in (v_writer, v_persist)
         and (not prosecdef or proowner <> 'postgres'::regrole
           or not coalesce(proconfig, '{}') @> array['search_path=pg_catalog, public'])
     )
  then raise exception 'Slice 4.6 catalog verification failed: function hardening'; end if;

  if has_function_privilege('public', v_writer, 'EXECUTE')
     or has_function_privilege('anon', v_writer, 'EXECUTE')
     or not has_function_privilege('authenticated', v_writer, 'EXECUTE')
     or has_function_privilege('authenticated', v_persist, 'EXECUTE')
     or not has_function_privilege('service_role', v_persist, 'EXECUTE')
  then raise exception 'Slice 4.6 catalog verification failed: function grants'; end if;

  if position('schedule_arrival_at' in pg_get_functiondef(v_persist)) = 0 then
    raise exception 'Slice 4.6 catalog verification failed: typed arrival persistence';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.corralio_external_api_calls'::regclass
      and conname = 'corralio_external_api_calls_operation_check'
      and pg_get_constraintdef(oid) like '%route_what_fits%'
  ) then raise exception 'Slice 4.6 catalog verification failed: routing audit vocabulary'; end if;
end
$verify$;

select 'SLICE 4.6 CATALOG VERIFICATION PASSED' as corralio_slice46_catalog_verification;
