do $verify$
declare
  v_lookup oid := 'public.corralio_find_unique_canonical_venue_by_name_v1(text)'::regprocedure;
begin
  if to_regclass('public.corralio_venue_aliases') is null then
    raise exception 'Slice 4.4D catalog verification failed: alias table missing';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'corralio_venue_aliases'
      and c.relrowsecurity and c.relforcerowsecurity and c.relowner = 'postgres'::regrole
  ) then raise exception 'Slice 4.4D catalog verification failed: alias RLS/owner'; end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'corralio_venue_aliases'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then raise exception 'Slice 4.4D catalog verification failed: untrusted alias grant'; end if;
  if not has_table_privilege('service_role', 'public.corralio_venue_aliases', 'SELECT')
     or not has_table_privilege('service_role', 'public.corralio_venue_aliases', 'INSERT')
     or has_table_privilege('service_role', 'public.corralio_venue_aliases', 'UPDATE')
     or has_table_privilege('service_role', 'public.corralio_venue_aliases', 'DELETE')
  then raise exception 'Slice 4.4D catalog verification failed: service alias grants'; end if;
  if (select count(*) from pg_constraint
      where conrelid = 'public.corralio_venue_aliases'::regclass
        and pg_get_constraintdef(oid) like '%canonical_venue_id%provisional_venue_id%') < 1
  then raise exception 'Slice 4.4D catalog verification failed: exactly-one target'; end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.corralio_venue_aliases'::regclass
      and contype = 'u' and conname = 'corralio_venue_aliases_identity_unique'
  ) then raise exception 'Slice 4.4D catalog verification failed: alias uniqueness'; end if;
  if exists (
    select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = v_lookup
      and (acl.grantee = 0 or acl.grantee in ('anon'::regrole, 'authenticated'::regrole))
      and acl.privilege_type = 'EXECUTE'
  ) or not has_function_privilege('service_role', v_lookup, 'EXECUTE')
  then raise exception 'Slice 4.4D catalog verification failed: lookup grants'; end if;
  if exists (
    select 1 from pg_proc where oid = v_lookup
      and (not prosecdef or proowner <> 'postgres'::regrole
        or proconfig is distinct from array['search_path=pg_catalog, public']::text[])
  ) then raise exception 'Slice 4.4D catalog verification failed: lookup hardening'; end if;
  if to_regclass('public.venues_identity_normalized_name_idx') is null then
    raise exception 'Slice 4.4D catalog verification failed: canonical-name index';
  end if;
end
$verify$;

select 'SLICE 4.4D CATALOG VERIFICATION PASSED' as corralio_slice44d_catalog_verification;
