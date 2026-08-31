-- Read-only Slice 3.6B Phase 1 catalog verification. Run only after a human
-- applies 20260831_corralio_slice36b_required_arrival.sql.
do $verify$
declare
  v_writer oid := to_regprocedure(
    'public.corralio_update_schedule_source_arrival_v1(uuid,smallint)'
  );
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'corralio_schedule_sources'
      and column_name = 'arrival_buffer_minutes'
      and data_type = 'smallint'
      and is_nullable = 'YES'
  ) then raise exception 'Slice 3.6B Phase 1 catalog verification failed: source preference column'; end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.corralio_schedule_sources'::regclass
      and conname = 'corralio_schedule_sources_arrival_buffer_check'
      and contype = 'c'
      and convalidated
      and pg_get_constraintdef(oid) like '%arrival_buffer_minutes >= 0%'
      and pg_get_constraintdef(oid) like '%arrival_buffer_minutes <= 120%'
      and pg_get_constraintdef(oid) like '%arrival_buffer_minutes % 5%'
  ) then raise exception 'Slice 3.6B Phase 1 catalog verification failed: source preference constraint'; end if;

  if exists (
    select 1
    from pg_class
    where oid = 'public.corralio_schedule_sources'::regclass
      and (not relrowsecurity or not relforcerowsecurity)
  ) then raise exception 'Slice 3.6B Phase 1 catalog verification failed: source RLS'; end if;

  if not has_column_privilege(
    'authenticated', 'public.corralio_schedule_sources', 'arrival_buffer_minutes', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.corralio_schedule_sources', 'arrival_buffer_minutes', 'UPDATE'
  ) or has_column_privilege(
    'anon', 'public.corralio_schedule_sources', 'arrival_buffer_minutes', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.corralio_schedule_sources', 'source_url', 'SELECT'
  ) then raise exception 'Slice 3.6B Phase 1 catalog verification failed: source column grants'; end if;

  if v_writer is null or exists (
    select 1
    from pg_proc
    where oid = v_writer
      and (
        not prosecdef
        or proowner <> 'postgres'::regrole
        or proconfig is distinct from array['search_path=pg_catalog, public']
      )
  ) then raise exception 'Slice 3.6B Phase 1 catalog verification failed: writer hardening'; end if;

  if has_function_privilege('public', v_writer, 'EXECUTE')
     or has_function_privilege('anon', v_writer, 'EXECUTE')
     or not has_function_privilege('authenticated', v_writer, 'EXECUTE')
     or has_function_privilege('service_role', v_writer, 'EXECUTE')
  then raise exception 'Slice 3.6B Phase 1 catalog verification failed: writer grants'; end if;

  if position('member.role = ''owner''' in pg_get_functiondef(v_writer)) = 0
     or position('member.status = ''active''' in pg_get_functiondef(v_writer)) = 0
     or position('member.user_id = v_user_id' in pg_get_functiondef(v_writer)) = 0
     or position('source.household_id' in pg_get_functiondef(v_writer)) = 0
     or position('source_url' in pg_get_functiondef(v_writer)) > 0
  then raise exception 'Slice 3.6B Phase 1 catalog verification failed: writer authorization boundary'; end if;
end
$verify$;

select 'SLICE 3.6B PHASE 1 CATALOG VERIFICATION PASSED'
  as corralio_slice36b_phase1_catalog_verification;
