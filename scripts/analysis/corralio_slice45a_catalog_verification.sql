-- Read-only Slice 4.5A catalog verification. Run after the 4.5A migration.
do $verify$
declare
  v_activate oid := to_regprocedure('public.corralio_activate_overture_refresh_v1(uuid)');
begin
  if exists (
    select 1
    from (values
      ('intent_category'), ('operating_status'),
      ('quality_rule_version'), ('dedupe_rule_version')
    ) expected(column_name)
    where not exists (
      select 1 from information_schema.columns column_info
      where column_info.table_schema = 'public'
        and column_info.table_name = 'corralio_overture_candidates'
        and column_info.column_name = expected.column_name
        and column_info.is_nullable = 'NO'
    )
  ) then
    raise exception 'Slice 4.5A catalog verification failed: typed columns';
  end if;

  if exists (
    select 1
    from (values
      ('corralio_overture_candidate_intent_check'),
      ('corralio_overture_candidate_pool_intent_coherence_check'),
      ('corralio_overture_candidate_operating_status_check'),
      ('corralio_overture_candidate_quality_rule_check'),
      ('corralio_overture_candidate_dedupe_rule_check')
    ) expected(constraint_name)
    where not exists (
      select 1 from pg_constraint constraint_info
      where constraint_info.conrelid = 'public.corralio_overture_candidates'::regclass
        and constraint_info.conname = expected.constraint_name
        and constraint_info.convalidated
    )
  ) then
    raise exception 'Slice 4.5A catalog verification failed: constraints';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'corralio_overture_candidates'
      and indexname = 'corralio_overture_candidates_active_intent_idx'
  ) then
    raise exception 'Slice 4.5A catalog verification failed: active intent index';
  end if;

  if v_activate is null
     or position('confirmed_closed' in pg_get_functiondef(v_activate)) = 0
     or position('corralio-overture-candidate-quality-v1' in pg_get_functiondef(v_activate)) = 0
     or position('corralio-overture-dedupe-v1' in pg_get_functiondef(v_activate)) = 0
     or position('max_candidates_per_category' in pg_get_functiondef(v_activate)) = 0
     or position('corralio_overture_provenance' in pg_get_functiondef(v_activate)) = 0
     or position('corralio_overture_refresh_scopes' in pg_get_functiondef(v_activate)) = 0
  then
    raise exception 'Slice 4.5A catalog verification failed: activation contract';
  end if;

  if exists (
    select 1 from pg_proc
    where oid = v_activate
      and (
        prosecdef is false
        or proowner <> (select oid from pg_roles where rolname = 'postgres')
        or not coalesce(proconfig, '{}') @> array['search_path=pg_catalog, public']
      )
  ) then
    raise exception 'Slice 4.5A catalog verification failed: function hardening';
  end if;

  if has_function_privilege('public', v_activate, 'EXECUTE')
     or has_function_privilege('anon', v_activate, 'EXECUTE')
     or has_function_privilege('authenticated', v_activate, 'EXECUTE')
     or not has_function_privilege('service_role', v_activate, 'EXECUTE')
  then
    raise exception 'Slice 4.5A catalog verification failed: function grants';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'corralio_overture_candidates'
      and (
        (column_name = 'quality_rule_version'
          and column_default not like '%corralio-overture-candidate-quality-v1%')
        or (column_name = 'dedupe_rule_version'
          and column_default not like '%corralio-overture-dedupe-v1%')
      )
  ) then
    raise exception 'Slice 4.5A catalog verification failed: V1 insert defaults';
  end if;
end
$verify$;

select 'SLICE 4.5A CATALOG VERIFICATION PASSED' as corralio_slice45a_catalog_verification;
