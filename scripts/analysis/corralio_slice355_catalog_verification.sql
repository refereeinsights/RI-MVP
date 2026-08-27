do $verify$
declare
  v_batch oid := 'public.corralio_claim_ics_refresh_batch_v1(integer)'::regprocedure;
  v_manual oid := 'public.corralio_claim_ics_refresh_source_v1(uuid,uuid)'::regprocedure;
  v_fail oid := 'public.corralio_fail_claimed_ics_refresh_v1(uuid,uuid,text)'::regprocedure;
  v_trigger oid := 'public.corralio_normalize_refresh_failure_window_v1()'::regprocedure;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'corralio_schedule_sources'
      and column_name = 'refresh_failure_started_at'
      and data_type = 'timestamp with time zone'
  ) then raise exception 'Slice 3.5.5 catalog verification failed: failure window column'; end if;

  if exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'corralio_schedule_sources'
      and column_name in ('source_url', 'refresh_claim_token', 'refresh_claimed_at', 'refresh_failure_started_at')
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then raise exception 'Slice 3.5.5 catalog verification failed: private source metadata grant'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.corralio_schedule_sources'::regclass
      and conname = 'corralio_schedule_sources_refresh_pause_state_check'
      and pg_get_constraintdef(oid) like '%refresh_failure_started_at%'
  ) then raise exception 'Slice 3.5.5 catalog verification failed: failure state constraint'; end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.corralio_schedule_sources'::regclass
      and tgname = 'corralio_schedule_sources_normalize_refresh_failure_window'
      and tgenabled <> 'D'
  ) then raise exception 'Slice 3.5.5 catalog verification failed: success reset trigger'; end if;

  if exists (
    select 1 from pg_proc p
    where p.oid in (v_batch, v_manual, v_fail)
      and (not p.prosecdef or p.proowner <> 'postgres'::regrole or p.proconfig is distinct from array['search_path=pg_catalog, public'])
  ) then raise exception 'Slice 3.5.5 catalog verification failed: function hardening'; end if;

  if exists (
    select 1 from pg_proc p,
    lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid in (v_batch, v_manual, v_fail, v_trigger)
      and (acl.grantee = 0 or acl.grantee in ('anon'::regrole, 'authenticated'::regrole))
      and acl.privilege_type = 'EXECUTE'
  ) then raise exception 'Slice 3.5.5 catalog verification failed: untrusted execute'; end if;

  if not has_function_privilege('service_role', v_batch, 'EXECUTE')
     or not has_function_privilege('service_role', v_manual, 'EXECUTE')
     or not has_function_privilege('service_role', v_fail, 'EXECUTE')
  then raise exception 'Slice 3.5.5 catalog verification failed: service execute'; end if;

  if position('interval ''3 hours''' in lower(pg_get_functiondef(v_batch))) = 0
     or position('least(greatest(coalesce(p_limit, 10), 1), 10)' in lower(pg_get_functiondef(v_batch))) = 0
     or position('for update skip locked' in lower(pg_get_functiondef(v_batch))) = 0
  then raise exception 'Slice 3.5.5 catalog verification failed: bounded automatic claim'; end if;

  if position('source.household_id = p_household_id' in lower(pg_get_functiondef(v_manual))) = 0
     or position('interval ''5 minutes''' in lower(pg_get_functiondef(v_manual))) = 0
     or position('interval ''10 minutes''' in lower(pg_get_functiondef(v_manual))) = 0
     or position('for update' in lower(pg_get_functiondef(v_manual))) = 0
  then raise exception 'Slice 3.5.5 catalog verification failed: manual claim contract'; end if;

  if position('interval ''24 hours''' in lower(pg_get_functiondef(v_fail))) = 0
     or position('refresh_failure_started_at' in lower(pg_get_functiondef(v_fail))) = 0
  then raise exception 'Slice 3.5.5 catalog verification failed: bounded failure window'; end if;

  if exists (
    select 1 from pg_proc where oid = v_trigger
      and (
        proowner <> 'postgres'::regrole
        or prosecdef
        or proconfig is distinct from array['search_path=pg_catalog, public']
      )
  ) then raise exception 'Slice 3.5.5 catalog verification failed: trigger hardening'; end if;
end
$verify$;

select 'SLICE 3.5.5 CATALOG VERIFICATION PASSED'
  as corralio_slice355_catalog_verification;
