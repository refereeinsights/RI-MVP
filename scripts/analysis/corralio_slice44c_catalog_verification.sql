-- Read-only Corralio Slice 4.4C catalog verification. Run after human migration application.

do $verify$
declare
  v_provisional oid := 'public.corralio_provisional_venues'::regclass;
  v_evidence oid := 'public.corralio_provisional_venue_evidence'::regclass;
  v_transitions oid := 'public.corralio_provisional_venue_transitions'::regclass;
  v_create oid := 'public.corralio_create_or_reuse_provisional_venue_v2(uuid,uuid,text,text,text,text,text,text,double precision,double precision,text,text,text,text)'::regprocedure;
  v_suppress oid := 'public.corralio_suppress_provisional_venue_v2(uuid,text)'::regprocedure;
  v_merge_exact oid := 'public.corralio_merge_provisional_venue_exact_v1(uuid,uuid)'::regprocedure;
  v_merge_trusted oid := 'public.corralio_merge_provisional_venue_trusted_v1(uuid,uuid,text)'::regprocedure;
  v_merge_internal oid := 'public.corralio_merge_provisional_venue_internal_v1(uuid,uuid,text,text)'::regprocedure;
  v_reconcile oid := 'public.corralio_reconcile_provisional_venue_v1(uuid,uuid)'::regprocedure;
  v_eligible oid := 'public.corralio_provisional_venue_promotion_eligible_v1(uuid)'::regprocedure;
begin
  if exists (
    select 1 from pg_proc where pronamespace = 'public'::regnamespace
      and proname in ('corralio_create_or_reuse_provisional_venue_v1', 'corralio_suppress_provisional_venue_v1')
  ) then raise exception '4.4C catalog failed: unaudited 4.4B mutation function remains'; end if;

  if exists (
    select 1 from pg_class
    where oid in (v_provisional, v_evidence, v_transitions)
      and (not relrowsecurity or not relforcerowsecurity or pg_get_userbyid(relowner) <> 'postgres')
  ) then raise exception '4.4C catalog failed: owner/forced-RLS'; end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('corralio_provisional_venues','corralio_provisional_venue_evidence','corralio_provisional_venue_transitions')
  ) then raise exception '4.4C catalog failed: unexpected client policy'; end if;

  if exists (
    select 1 from pg_class c,
    lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    where c.oid in (v_provisional, v_evidence, v_transitions)
      and (acl.grantee = 0 or acl.grantee in ('anon'::regrole, 'authenticated'::regrole))
      and acl.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
  ) then raise exception '4.4C catalog failed: public/client table privilege'; end if;

  if not has_table_privilege('service_role', v_provisional, 'SELECT')
     or has_table_privilege('service_role', v_provisional, 'INSERT,UPDATE,DELETE')
     or not has_table_privilege('service_role', v_evidence, 'SELECT')
     or has_table_privilege('service_role', v_evidence, 'INSERT,UPDATE,DELETE')
     or not has_table_privilege('service_role', v_transitions, 'SELECT')
     or has_table_privilege('service_role', v_transitions, 'INSERT,UPDATE,DELETE') then
    raise exception '4.4C catalog failed: service table privilege is not read-only';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'corralio_provisional_venue_evidence'
      and column_name in (
        'source_url','schedule_source_id','event_id','household_id','child_id','team_id',
        'raw_location','location_text','payload','metadata','reason','notes'
      )
  ) then raise exception '4.4C catalog failed: private/arbitrary evidence column'; end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('corralio_provisional_venue_evidence','corralio_provisional_venue_transitions')
      and data_type in ('json','jsonb')
  ) then raise exception '4.4C catalog failed: generic JSON storage'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = v_evidence and conname = 'corralio_provisional_evidence_type_check'
      and pg_get_constraintdef(oid) like '%ics_observation%'
      and pg_get_constraintdef(oid) not like '%quick_check_verification%'
      and pg_get_constraintdef(oid) not like '%overture_place_match%'
  ) then raise exception '4.4C catalog failed: production evidence is not ICS-only'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = v_evidence and conname = 'corralio_provisional_evidence_observation_unique'
  ) then raise exception '4.4C catalog failed: observation idempotency'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = v_provisional and conname = 'corralio_provisional_venues_lifecycle_state_check'
      and pg_get_constraintdef(oid) like '%merged_into_provisional_id%'
      and pg_get_constraintdef(oid) like '%canonical_venue_id%'
  ) then raise exception '4.4C catalog failed: lifecycle coherence'; end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'corralio_provisional_venues'
      and column_name = 'promotion_eligible'
  ) then raise exception '4.4C catalog failed: writable eligibility field'; end if;

  if exists (
    select 1 from pg_proc
    where oid in (v_create, v_suppress, v_merge_exact, v_merge_trusted, v_merge_internal, v_reconcile)
      and (not prosecdef
        or proconfig is distinct from array['search_path=pg_catalog, public']::text[]
        or pg_get_userbyid(proowner) <> 'postgres')
  ) then raise exception '4.4C catalog failed: lifecycle function security'; end if;

  if exists (
    select 1 from pg_proc where oid = v_eligible
      and (prosecdef
        or proconfig is distinct from array['search_path=pg_catalog, public']::text[]
        or pg_get_userbyid(proowner) <> 'postgres')
  ) then raise exception '4.4C catalog failed: eligibility function security'; end if;

  if position(
       'on conflict (provisional_venue_id, observation_fingerprint)'
       in pg_get_functiondef(v_create)
     ) > 0
     or position(
       'on conflict on constraint corralio_provisional_evidence_observation_unique do nothing'
       in pg_get_functiondef(v_create)
     ) = 0 then
    raise exception '4.4C catalog failed: ambiguous evidence conflict target';
  end if;

  if exists (
    select 1 from pg_proc p,
    lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid in (v_create, v_suppress, v_merge_exact, v_merge_trusted, v_merge_internal, v_reconcile, v_eligible)
      and (acl.grantee = 0 or acl.grantee in ('anon'::regrole, 'authenticated'::regrole))
      and acl.privilege_type = 'EXECUTE'
  ) then raise exception '4.4C catalog failed: public/client function execute'; end if;

  if not has_function_privilege('service_role', v_create, 'EXECUTE')
     or not has_function_privilege('service_role', v_suppress, 'EXECUTE')
     or not has_function_privilege('service_role', v_merge_exact, 'EXECUTE')
     or not has_function_privilege('service_role', v_merge_trusted, 'EXECUTE')
     or not has_function_privilege('service_role', v_reconcile, 'EXECUTE')
     or not has_function_privilege('service_role', v_eligible, 'EXECUTE')
     or has_function_privilege('service_role', v_merge_internal, 'EXECUTE') then
    raise exception '4.4C catalog failed: narrow service RPC boundary';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'venues_public'
      and column_name like 'corralio_provisional%'
  ) then raise exception '4.4C catalog failed: public view contamination'; end if;
end;
$verify$;

select 'SLICE 4.4C CATALOG VERIFICATION PASSED' as corralio_slice44c_catalog_verification;
