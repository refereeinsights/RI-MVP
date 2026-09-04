-- Read-only Slice 3.6B Phase 3A catalog verification. Run only after a human
-- applies 20260904_corralio_slice36b_phase3a_temporary_routing_origin.sql.
do $verify$
declare
  v_prepare oid := to_regprocedure('public.corralio_prepare_event_routing_origin_v1(uuid,text)');
  v_clear oid := to_regprocedure('public.corralio_clear_event_routing_origin_v1(uuid)');
  v_claim oid := to_regprocedure('public.corralio_claim_current_location_route_v1(uuid,uuid,uuid)');
  v_release oid := to_regprocedure('public.corralio_release_current_location_route_v1(uuid,uuid,uuid)');
  v_cleanup oid := to_regprocedure('public.corralio_cleanup_event_routing_origins_v1(integer)');
begin
  if to_regclass('public.corralio_event_routing_origins') is null
     or to_regclass('public.corralio_current_location_route_claims') is null
  then raise exception 'Slice 3.6B Phase 3A catalog verification failed: tables'; end if;

  if exists (
    select 1 from pg_class
    where oid in (
      'public.corralio_event_routing_origins'::regclass,
      'public.corralio_current_location_route_claims'::regclass
    ) and (not relrowsecurity or not relforcerowsecurity)
  ) then raise exception 'Slice 3.6B Phase 3A catalog verification failed: forced RLS'; end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'corralio_current_location_route_claims'
      and column_name not in ('household_id','event_id','claim_token','claimed_at')
  ) or exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'corralio_current_location_route_claims'
      and column_name in ('latitude','longitude','origin_lat','origin_lng','route_result','estimated_drive_minutes')
  ) then raise exception 'Slice 3.6B Phase 3A catalog verification failed: current-location persistence'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.corralio_event_routing_origins'::regclass
      and conname = 'corralio_event_routing_origins_event_fk'
      and contype = 'f'
      and confdeltype = 'c'
  ) then raise exception 'Slice 3.6B Phase 3A catalog verification failed: event ownership FK'; end if;

  if (select count(*) from pg_constraint
      where conrelid = 'public.corralio_event_routing_origins'::regclass
        and conname in (
          'corralio_event_routing_origins_kind_check',
          'corralio_event_routing_origins_address_check',
          'corralio_event_routing_origins_coordinate_pair_check',
          'corralio_event_routing_origins_geocode_state_check',
          'corralio_event_routing_origins_route_success_check',
          'corralio_event_routing_origins_route_failure_check'
        ) and convalidated) <> 6
  then raise exception 'Slice 3.6B Phase 3A catalog verification failed: state constraints'; end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('corralio_event_routing_origins','corralio_current_location_route_claims')
      and grantee in ('PUBLIC','anon','authenticated')
      and privilege_type <> 'SELECT'
  ) or has_table_privilege('anon', 'public.corralio_event_routing_origins', 'SELECT')
     or has_table_privilege('authenticated', 'public.corralio_current_location_route_claims', 'SELECT')
  then raise exception 'Slice 3.6B Phase 3A catalog verification failed: table grants'; end if;

  if v_prepare is null or v_clear is null or v_claim is null or v_release is null or v_cleanup is null
  then raise exception 'Slice 3.6B Phase 3A catalog verification failed: functions'; end if;

  if exists (
    select 1 from pg_proc
    where oid in (v_prepare,v_clear,v_claim,v_release,v_cleanup)
      and (not prosecdef or proowner <> 'postgres'::regrole or proconfig is distinct from array['search_path=pg_catalog, public'])
  ) then raise exception 'Slice 3.6B Phase 3A catalog verification failed: function hardening'; end if;

  if has_function_privilege('public', v_prepare, 'EXECUTE')
     or has_function_privilege('anon', v_prepare, 'EXECUTE')
     or not has_function_privilege('authenticated', v_prepare, 'EXECUTE')
     or has_function_privilege('public', v_clear, 'EXECUTE')
     or has_function_privilege('anon', v_clear, 'EXECUTE')
     or not has_function_privilege('authenticated', v_clear, 'EXECUTE')
     or has_function_privilege('authenticated', v_claim, 'EXECUTE')
     or has_function_privilege('authenticated', v_release, 'EXECUTE')
     or has_function_privilege('authenticated', v_cleanup, 'EXECUTE')
     or not has_function_privilege('service_role', v_claim, 'EXECUTE')
     or not has_function_privilege('service_role', v_release, 'EXECUTE')
     or not has_function_privilege('service_role', v_cleanup, 'EXECUTE')
  then raise exception 'Slice 3.6B Phase 3A catalog verification failed: function grants'; end if;

  if position('member.user_id = v_user_id' in pg_get_functiondef(v_prepare)) = 0
     or position('member.role = ''owner''' in pg_get_functiondef(v_prepare)) = 0
     or position('member.status = ''active''' in pg_get_functiondef(v_prepare)) = 0
     or position('coalesce(event.ends_at, event.starts_at)' in pg_get_functiondef(v_cleanup)) = 0
     or position('interval ''24 hours''' in pg_get_functiondef(v_cleanup)) = 0
     or position('limit p_limit' in pg_get_functiondef(v_cleanup)) = 0
     or position('return coalesce(v_claim_token = p_claim_token, false)' in pg_get_functiondef(v_claim)) = 0
  then raise exception 'Slice 3.6B Phase 3A catalog verification failed: authorization/lifecycle body'; end if;
end
$verify$;

select 'SLICE 3.6B PHASE 3A CATALOG VERIFICATION PASSED'
  as corralio_slice36b_phase3a_catalog_verification;
