-- Read-only Corralio Gate 3 durable SMS state catalog verification.
do $verify$
declare
  v_request oid;
  v_hook oid;
begin
  select p.oid into v_request
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'corralio_authorize_sms_otp_request_v1'
    and p.proargtypes = '25 25'::oidvector;
  select p.oid into v_hook
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'corralio_authorize_sms_hook_attempt_v1'
    and p.proargtypes = '25 25 21'::oidvector;
  if v_request is null or v_hook is null then
    raise exception 'Gate 3 catalog verification failed: database-clock RPC signatures';
  end if;
  if position('clock_timestamp()' in lower(pg_get_functiondef(v_request))) = 0
     or position('clock_timestamp()' in lower(pg_get_functiondef(v_hook))) = 0
     or lower(pg_get_functiondef(v_request)) like '%p_now%'
     or lower(pg_get_functiondef(v_hook)) like '%p_now%'
  then raise exception 'Gate 3 catalog verification failed: database clock authority'; end if;

  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in ('corralio_sms_test_policy','corralio_sms_test_allowlist',
          'corralio_sms_request_rate_state','corralio_sms_request_decisions',
          'corralio_sms_phone_send_permits','corralio_sms_webhook_claims',
          'corralio_sms_daily_segment_budgets','corralio_sms_destination_segment_budgets')) <> 8
  then raise exception 'Gate 3 catalog verification failed: expected tables'; end if;

  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in ('corralio_sms_test_policy','corralio_sms_test_allowlist',
          'corralio_sms_request_rate_state','corralio_sms_request_decisions',
          'corralio_sms_phone_send_permits','corralio_sms_webhook_claims',
          'corralio_sms_daily_segment_budgets','corralio_sms_destination_segment_budgets')
        and c.relrowsecurity and c.relforcerowsecurity) <> 8
  then raise exception 'Gate 3 catalog verification failed: forced RLS'; end if;

  if exists (select 1 from information_schema.role_table_grants
      where table_schema = 'public' and table_name like 'corralio_sms_%'
        and grantee in ('PUBLIC','anon','authenticated','service_role'))
  then raise exception 'Gate 3 catalog verification failed: table grant'; end if;

  if exists (select 1 from pg_proc p,
      lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where p.oid in (v_request, v_hook) and acl.privilege_type = 'EXECUTE'
        and (acl.grantee = 0 or acl.grantee in ('anon'::regrole,'authenticated'::regrole)))
  then raise exception 'Gate 3 catalog verification failed: untrusted RPC execute'; end if;
  if not has_function_privilege('service_role', v_request, 'EXECUTE')
     or not has_function_privilege('service_role', v_hook, 'EXECUTE')
  then raise exception 'Gate 3 catalog verification failed: service RPC execute'; end if;
  if exists (select 1 from pg_proc where oid in (v_request, v_hook)
      and (not prosecdef or proowner <> 'postgres'::regrole
        or coalesce(array_to_string(proconfig, ','), '') <> 'search_path=pg_catalog, public'))
  then raise exception 'Gate 3 catalog verification failed: RPC ownership/config'; end if;

  if exists (
    select 1
    from unnest(array[
      'corralio_sms_test_policy_singleton_check',
      'corralio_sms_test_policy_version_check',
      'corralio_sms_test_policy_mode_check',
      'corralio_sms_test_policy_limits_check',
      'corralio_sms_test_allowlist_hmac_check',
      'corralio_sms_request_rate_type_check',
      'corralio_sms_request_rate_hmac_check',
      'corralio_sms_request_rate_count_check',
      'corralio_sms_request_rate_cooldown_check',
      'corralio_sms_request_decisions_destination_check',
      'corralio_sms_request_decisions_ip_check',
      'corralio_sms_request_decisions_decision_check',
      'corralio_sms_request_decisions_retention_check',
      'corralio_sms_phone_send_permits_hmac_check',
      'corralio_sms_phone_send_permits_expiry_check',
      'corralio_sms_phone_send_permits_webhook_check',
      'corralio_sms_phone_send_permits_state_check',
      'corralio_sms_phone_send_permits_retention_check',
      'corralio_sms_webhook_claims_id_check',
      'corralio_sms_webhook_claims_hmac_check',
      'corralio_sms_webhook_claims_permit_unique',
      'corralio_sms_webhook_claims_decision_check',
      'corralio_sms_webhook_claims_authorization_check',
      'corralio_sms_webhook_claims_retention_check',
      'corralio_sms_daily_segment_budgets_count_check',
      'corralio_sms_destination_segment_budgets_hmac_check',
      'corralio_sms_destination_segment_budgets_count_check'
    ]::text[]) expected(name)
    where not exists (
      select 1 from pg_constraint constraint_row
      join pg_namespace namespace_row on namespace_row.oid = constraint_row.connamespace
      where namespace_row.nspname = 'public' and constraint_row.conname = expected.name
    )
  ) then raise exception 'Gate 3 catalog verification failed: expected closed/bounded constraints'; end if;

  if (select count(*) from pg_indexes where schemaname = 'public'
      and indexname in ('corralio_sms_request_decisions_retention_idx',
        'corralio_sms_phone_send_permits_one_live_idx',
        'corralio_sms_phone_send_permits_webhook_idx',
        'corralio_sms_phone_send_permits_retention_idx',
        'corralio_sms_webhook_claims_retention_idx')) <> 5
  then raise exception 'Gate 3 catalog verification failed: expected indexes'; end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public'
      and indexname = 'corralio_sms_phone_send_permits_one_live_idx'
      and indexdef ilike '%unique%destination_hmac%where%consumed_at is null%closed_at is null%')
     or not exists (select 1 from pg_indexes where schemaname = 'public'
      and indexname = 'corralio_sms_phone_send_permits_webhook_idx'
      and indexdef ilike '%unique%consumed_by_webhook_id%where%consumed_by_webhook_id is not null%')
  then raise exception 'Gate 3 catalog verification failed: permit uniqueness indexes'; end if;
  if not exists (select 1 from pg_constraint
      where conrelid = 'public.corralio_sms_webhook_claims'::regclass and contype = 'u'
        and pg_get_constraintdef(oid) like '%permit_id%')
  then raise exception 'Gate 3 catalog verification failed: one permit consumer'; end if;

  if exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name like 'corralio_sms_%'
        and column_name in ('phone','phone_number','raw_phone','ip','ip_address','raw_ip','otp','otp_code',
          'turnstile_token','message','message_body','hmac_secret','api_key','provider_payload','webhook_payload'))
  then raise exception 'Gate 3 catalog verification failed: forbidden sensitive columns'; end if;

  if not exists (select 1 from public.corralio_sms_test_policy where id = 1
      and not enabled and send_mode = 'test_allowlist' and global_daily_segment_limit = 20
      and destination_daily_segment_limit = 5 and max_segments_per_message = 1)
  then raise exception 'Gate 3 catalog verification failed: disabled bounded policy'; end if;

  if position('reserved_segments = reserved_segments + p_segments' in pg_get_functiondef(v_hook)) = 0
     or pg_get_functiondef(v_hook) ~* 'reserved_segments\s*=\s*reserved_segments\s*-|release_sms|refund'
  then raise exception 'Gate 3 catalog verification failed: permanent segment reservation'; end if;
  if position('v_policy.send_mode <> ''test_allowlist''' in pg_get_functiondef(v_request)) = 0
     or position('v_policy.send_mode <> ''test_allowlist''' in pg_get_functiondef(v_hook)) = 0
  then raise exception 'Gate 3 catalog verification failed: defensive invalid-mode handling'; end if;
end
$verify$;

select 'DURABLE GATE 3 CATALOG VERIFICATION PASSED'
  as corralio_sms_durable_state_catalog_verification;
