-- Read-only Slice 4.4B catalog verification. Run after human migration application.

do $verify$
declare
  v_table oid := 'public.corralio_provisional_venues'::regclass;
  v_match oid := 'public.corralio_event_venue_matches'::regclass;
  v_create oid := 'public.corralio_create_or_reuse_provisional_venue_v1(uuid,uuid,text,text,text,text,text,text,double precision,double precision,text)'::regprocedure;
  v_suppress oid := 'public.corralio_suppress_provisional_venue_v1(uuid)'::regprocedure;
begin
  if not exists (
    select 1 from pg_class
    where oid = v_table and relrowsecurity and relforcerowsecurity
      and pg_get_userbyid(relowner) = 'postgres'
  ) then raise exception '4.4B catalog verification failed: provisional owner/RLS'; end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename in ('corralio_provisional_venues')
  ) then raise exception '4.4B catalog verification failed: unexpected client policy'; end if;

  if has_table_privilege('anon', v_table, 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', v_table, 'SELECT,INSERT,UPDATE,DELETE')
     or exists (
       select 1 from pg_class c,
       lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
       where c.oid = v_table and acl.grantee = 0
         and acl.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
     ) then raise exception '4.4B catalog verification failed: client/public table privilege'; end if;

  if not has_table_privilege('service_role', v_table, 'SELECT,INSERT,UPDATE') then
    raise exception '4.4B catalog verification failed: service privilege';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'corralio_event_venue_matches'
      and column_name = 'provisional_venue_id' and is_nullable = 'YES'
  ) then raise exception '4.4B catalog verification failed: typed association column'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = v_match and conname = 'corralio_event_venue_matches_state_check'
      and pg_get_constraintdef(oid) like '%provisional_venue_id%'
  ) then raise exception '4.4B catalog verification failed: association coherence'; end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'corralio_provisional_venues'
      and column_name in ('household_id','event_id','source_url','source_location_text','display_location_text','notes')
  ) then raise exception '4.4B catalog verification failed: private/raw column'; end if;

  if exists (
    select 1 from pg_proc
    where oid in (v_create, v_suppress)
      and (prosecdef or proconfig is distinct from array['search_path=pg_catalog, public']::text[]
           or pg_get_userbyid(proowner) <> 'postgres')
  ) then raise exception '4.4B catalog verification failed: RPC security configuration'; end if;

  if has_function_privilege('anon', v_create, 'EXECUTE')
     or has_function_privilege('authenticated', v_create, 'EXECUTE')
     or has_function_privilege('anon', v_suppress, 'EXECUTE')
     or has_function_privilege('authenticated', v_suppress, 'EXECUTE')
     or exists (
       select 1
       from pg_proc p,
       lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
       where p.oid in (v_create, v_suppress)
         and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
     ) then
    raise exception '4.4B catalog verification failed: client RPC execute';
  end if;

  if not has_function_privilege('service_role', v_create, 'EXECUTE')
     or not has_function_privilege('service_role', v_suppress, 'EXECUTE') then
    raise exception '4.4B catalog verification failed: service RPC execute';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'venues_public'
      and column_name like '%provisional%'
  ) then raise exception '4.4B catalog verification failed: public view contamination'; end if;
end;
$verify$;

select 'SLICE 4.4B CATALOG VERIFICATION PASSED' as corralio_slice44b_catalog_verification;
