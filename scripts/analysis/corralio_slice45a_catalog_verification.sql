-- Read-only Slice 4.5A catalog verification. Run after the 4.5A migration.
do $verify$
declare
  v_activate oid := to_regprocedure('public.corralio_activate_overture_refresh_v1(uuid)');
  v_tag_validator oid := to_regprocedure('public.corralio_validate_overture_candidate_food_tag_v1()');
  v_food_tags regclass := to_regclass('public.corralio_overture_candidate_food_tags');
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

  if v_food_tags is null or exists (
    select 1
    from (values
      ('candidate_id'), ('food_tag'), ('tag_rule_version'),
      ('evidence_field'), ('provenance_id'), ('created_at')
    ) expected(column_name)
    where not exists (
      select 1 from information_schema.columns column_info
      where column_info.table_schema = 'public'
        and column_info.table_name = 'corralio_overture_candidate_food_tags'
        and column_info.column_name = expected.column_name
        and column_info.is_nullable = 'NO'
    )
  ) then
    raise exception 'Slice 4.5A catalog verification failed: food-tag table/columns';
  end if;

  if exists (
    select 1
    from (values
      ('corralio_overture_candidate_food_tags_pkey'),
      ('corralio_overture_candidate_food_tag_value_check'),
      ('corralio_overture_candidate_food_tag_rule_check'),
      ('corralio_overture_candidate_food_tag_evidence_field_check'),
      ('corralio_overture_candidate_food_tag_candidate_fk'),
      ('corralio_overture_candidate_food_tag_provenance_fk')
    ) expected(constraint_name)
    where not exists (
      select 1 from pg_constraint constraint_info
      where constraint_info.conrelid = v_food_tags
        and constraint_info.conname = expected.constraint_name
        and constraint_info.convalidated
    )
  ) or exists (
    select 1 from pg_constraint constraint_info
    where constraint_info.conrelid = v_food_tags
      and constraint_info.conname in (
        'corralio_overture_candidate_food_tag_candidate_fk',
        'corralio_overture_candidate_food_tag_provenance_fk'
      )
      and constraint_info.confdeltype <> 'c'
  ) then
    raise exception 'Slice 4.5A catalog verification failed: food-tag constraints';
  end if;

  if not exists (
    select 1 from pg_constraint constraint_info
    where constraint_info.conrelid = v_food_tags
      and constraint_info.conname = 'corralio_overture_candidate_food_tag_value_check'
      and pg_get_constraintdef(constraint_info.oid) like '%mexican%'
      and pg_get_constraintdef(constraint_info.oid) like '%chinese%'
      and pg_get_constraintdef(constraint_info.oid) like '%italian%'
      and pg_get_constraintdef(constraint_info.oid) like '%japanese%'
      and pg_get_constraintdef(constraint_info.oid) like '%sushi%'
      and pg_get_constraintdef(constraint_info.oid) like '%american%'
      and pg_get_constraintdef(constraint_info.oid) like '%burgers%'
      and pg_get_constraintdef(constraint_info.oid) like '%bbq%'
  ) then
    raise exception 'Slice 4.5A catalog verification failed: food-tag vocabulary';
  end if;

  if exists (
    select 1 from pg_class table_info
    where table_info.oid = v_food_tags
      and (
        table_info.relowner <> (select oid from pg_roles where rolname = 'postgres')
        or not table_info.relrowsecurity
        or not table_info.relforcerowsecurity
      )
  ) or exists (select 1 from pg_policy policy_info where policy_info.polrelid = v_food_tags)
     or has_table_privilege('public', v_food_tags, 'SELECT')
     or has_table_privilege('public', v_food_tags, 'INSERT')
     or has_table_privilege('public', v_food_tags, 'UPDATE')
     or has_table_privilege('public', v_food_tags, 'DELETE')
     or has_table_privilege('anon', v_food_tags, 'SELECT')
     or has_table_privilege('anon', v_food_tags, 'INSERT')
     or has_table_privilege('anon', v_food_tags, 'UPDATE')
     or has_table_privilege('anon', v_food_tags, 'DELETE')
     or has_table_privilege('authenticated', v_food_tags, 'SELECT')
     or has_table_privilege('authenticated', v_food_tags, 'INSERT')
     or has_table_privilege('authenticated', v_food_tags, 'UPDATE')
     or has_table_privilege('authenticated', v_food_tags, 'DELETE')
     or not has_table_privilege('service_role', v_food_tags, 'SELECT')
     or not has_table_privilege('service_role', v_food_tags, 'INSERT')
     or has_table_privilege('service_role', v_food_tags, 'UPDATE')
     or has_table_privilege('service_role', v_food_tags, 'DELETE')
  then
    raise exception 'Slice 4.5A catalog verification failed: food-tag security';
  end if;

  if v_tag_validator is null
     or not exists (
       select 1 from pg_trigger trigger_info
       where trigger_info.tgrelid = v_food_tags
         and trigger_info.tgname = 'corralio_validate_overture_candidate_food_tag'
         and trigger_info.tgfoid = v_tag_validator
         and not trigger_info.tgisinternal
     )
     or exists (
       select 1 from pg_proc function_info
       where function_info.oid = v_tag_validator
         and (
           not function_info.prosecdef
           or function_info.proowner <> (select oid from pg_roles where rolname = 'postgres')
           or not coalesce(function_info.proconfig, '{}') @> array['search_path=pg_catalog, public']
         )
     )
     or has_function_privilege('public', v_tag_validator, 'EXECUTE')
     or has_function_privilege('anon', v_tag_validator, 'EXECUTE')
     or has_function_privilege('authenticated', v_tag_validator, 'EXECUTE')
     or has_function_privilege('service_role', v_tag_validator, 'EXECUTE')
  then
    raise exception 'Slice 4.5A catalog verification failed: food-tag validator';
  end if;

  if v_activate is null
     or position('confirmed_closed' in pg_get_functiondef(v_activate)) = 0
     or position('corralio-overture-candidate-quality-v1' in pg_get_functiondef(v_activate)) = 0
     or position('corralio-overture-dedupe-v1' in pg_get_functiondef(v_activate)) = 0
     or position('max_candidates_per_category' in pg_get_functiondef(v_activate)) = 0
     or position('corralio_overture_provenance' in pg_get_functiondef(v_activate)) = 0
     or position('corralio_overture_refresh_scopes' in pg_get_functiondef(v_activate)) = 0
     or position('corralio_overture_candidate_food_tags' in pg_get_functiondef(v_activate)) = 0
     or position('corralio-overture-food-tags-v1' in pg_get_functiondef(v_activate)) = 0
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
