-- Read-only, machine-failing Slice 4.5 catalog verification.
do $verify$
declare
  v_writer oid := 'public.corralio_record_overture_place_match_v1(uuid,text,text,text,boolean,text,text,bigint,text,double precision,text,text,timestamptz,text[],text[],text[],text[],timestamptz[])'::regprocedure;
  v_resolver oid := 'public.corralio_resolve_provisional_enrichment_target_v1(uuid)'::regprocedure;
  v_coordinate oid := 'public.corralio_read_canonical_venue_coordinate_v1(uuid)'::regprocedure;
  v_activate oid := 'public.corralio_activate_overture_refresh_v1(uuid)'::regprocedure;
  v_fail oid := 'public.corralio_fail_overture_refresh_v1(uuid,text)'::regprocedure;
begin
  if (
    select count(*) <> 5
      or not coalesce(bool_and(c.relrowsecurity and c.relforcerowsecurity), false)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in (
        'corralio_overture_evidence_details', 'corralio_overture_refreshes',
        'corralio_overture_refresh_scopes', 'corralio_overture_candidates',
        'corralio_overture_provenance'
      )
  ) then raise exception 'Slice 4.5 catalog verification failed: RLS boundary'; end if;

  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'corralio_overture_candidates'
        and column_name in (
          'canonical_venue_id','provisional_venue_id','overture_feature_id',
          'overture_release','overture_feature_version',
          'overture_existence_confidence','active'
        )) <> 7
  then raise exception 'Slice 4.5 catalog verification failed: candidate columns'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.corralio_overture_candidates'::regclass
      and pg_get_constraintdef(oid) like '%canonical_venue_id%provisional_venue_id%'
  ) then raise exception 'Slice 4.5 catalog verification failed: exactly-one venue constraint'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.corralio_provisional_venue_evidence'::regclass
      and pg_get_constraintdef(oid) like '%overture_place_match%'
  ) then raise exception 'Slice 4.5 catalog verification failed: evidence type'; end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name like 'corralio_overture_%'
      and grantee in ('PUBLIC','anon','authenticated')
  ) then raise exception 'Slice 4.5 catalog verification failed: untrusted table grant'; end if;

  if exists (
    select 1 from pg_proc p,
    lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid in (v_writer, v_resolver, v_coordinate, v_activate, v_fail)
      and (acl.grantee = 0 or acl.grantee in ('anon'::regrole, 'authenticated'::regrole))
      and acl.privilege_type = 'EXECUTE'
  ) then raise exception 'Slice 4.5 catalog verification failed: untrusted function execute'; end if;

  if not has_function_privilege('service_role', v_writer, 'EXECUTE')
     or not has_function_privilege('service_role', v_resolver, 'EXECUTE')
     or not has_function_privilege('service_role', v_coordinate, 'EXECUTE')
     or not has_function_privilege('service_role', v_activate, 'EXECUTE')
     or not has_function_privilege('service_role', v_fail, 'EXECUTE')
  then raise exception 'Slice 4.5 catalog verification failed: service function grant'; end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'venues_public'
      and column_name in ('latitude','longitude')
  ) then raise exception 'Slice 4.5 catalog verification failed: venues_public broadened'; end if;

  if exists (
    select 1 from pg_proc
    where oid in (v_writer, v_resolver, v_coordinate, v_activate, v_fail)
      and (
        prosecdef is false
        or proowner <> (select oid from pg_roles where rolname = 'postgres')
        or not coalesce(proconfig, '{}') @> array['search_path=pg_catalog, public']
      )
  ) then raise exception 'Slice 4.5 catalog verification failed: function hardening'; end if;

  if position('corralio_overture_provenance' in pg_get_functiondef(v_activate)) = 0
     or position('max_candidates_per_category' in pg_get_functiondef(v_activate)) = 0
  then raise exception 'Slice 4.5 catalog verification failed: activation completeness guard'; end if;
end
$verify$;

select 'SLICE 4.5 CATALOG VERIFICATION PASSED' as corralio_slice45_catalog_verification;
