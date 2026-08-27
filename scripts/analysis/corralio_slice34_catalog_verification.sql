do $verify$
declare
  v_writer oid := 'public.corralio_record_schedule_connection_event_v1(text,text,text)'::regprocedure;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'corralio_schedule_connection_events'
      and c.relkind = 'r'
      and c.relrowsecurity
      and c.relforcerowsecurity
  ) then raise exception 'Slice 3.4 catalog verification failed: RLS boundary'; end if;

  if (select relowner <> 'postgres'::regrole
      from pg_class where oid = 'public.corralio_schedule_connection_events'::regclass)
  then raise exception 'Slice 3.4 catalog verification failed: table owner'; end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'corralio_schedule_connection_events'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then raise exception 'Slice 3.4 catalog verification failed: untrusted table grant'; end if;

  if exists (
    select 1 from pg_proc p,
    lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = v_writer
      and (acl.grantee = 0 or acl.grantee = 'anon'::regrole)
      and acl.privilege_type = 'EXECUTE'
  ) then raise exception 'Slice 3.4 catalog verification failed: public/anon execute'; end if;

  if not has_function_privilege('authenticated', v_writer, 'EXECUTE')
     or not has_function_privilege('service_role', v_writer, 'EXECUTE')
  then raise exception 'Slice 3.4 catalog verification failed: trusted execute'; end if;

  if exists (
    select 1 from pg_proc
    where oid = v_writer
      and (not prosecdef or proowner <> 'postgres'::regrole or proconfig <> array['search_path=pg_catalog, public'])
  ) then raise exception 'Slice 3.4 catalog verification failed: function hardening'; end if;

  if position('on conflict (household_id, event_name, platform, reason, occurred_minute) do nothing'
    in lower(pg_get_functiondef(v_writer))) = 0
  then raise exception 'Slice 3.4 catalog verification failed: minute idempotency'; end if;

  if position('interval ''180 days''' in lower(pg_get_functiondef(v_writer))) = 0
  then raise exception 'Slice 3.4 catalog verification failed: retention'; end if;
end
$verify$;

select 'SLICE 3.4 CATALOG VERIFICATION PASSED' as corralio_slice34_catalog_verification;
