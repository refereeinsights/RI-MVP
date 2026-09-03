-- Read-only Phase A+B catalog verification. Run only after a human applies
-- 20260903_corralio_phase_ab_phone_schedule_intake.sql.
do $verify$
declare
  v_function oid;
  v_name text;
  v_functions text[] := array[
    'corralio_upsert_channel_identity_v1(uuid,uuid,text,text)',
    'corralio_resolve_channel_identity_v1(text,text)',
    'corralio_deactivate_channel_identity_v1(uuid,uuid,text)',
    'corralio_claim_telnyx_inbound_v1(text)',
    'corralio_complete_telnyx_inbound_v1(text,text)',
    'corralio_create_pending_schedule_intake_v1(uuid,uuid,text,text,uuid[],uuid[])',
    'corralio_claim_pending_schedule_resolution_v1(uuid,uuid,text,integer)',
    'corralio_finalize_pending_schedule_intake_v1(uuid,text,text,uuid)',
    'corralio_cancel_pending_schedule_intake_v1(uuid,uuid)',
    'corralio_cleanup_phase_ab_state_v1()'
  ];
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in (
      'corralio_channel_identities', 'corralio_telnyx_inbound_claims',
      'corralio_pending_schedule_intakes') and c.relkind = 'r'
      and c.relrowsecurity and c.relforcerowsecurity) <> 3 then
    raise exception 'Phase A+B catalog verification failed: forced RLS';
  end if;
  if exists (select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name in (
      'corralio_channel_identities', 'corralio_telnyx_inbound_claims',
      'corralio_pending_schedule_intakes')
      and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')) then
    raise exception 'Phase A+B catalog verification failed: table grants';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name in ('corralio_channel_identities', 'corralio_telnyx_inbound_claims',
      'corralio_pending_schedule_intakes')
    and column_name in ('phone', 'phone_number', 'email', 'source_url', 'calendar_url', 'message_body')) then
    raise exception 'Phase A+B catalog verification failed: raw-sensitive column';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'corralio_channel_identities_active_address_idx')
    or not exists (select 1 from pg_indexes where schemaname = 'public'
      and indexname = 'corralio_channel_identities_active_user_channel_idx')
    or not exists (select 1 from pg_indexes where schemaname = 'public'
      and indexname = 'corralio_pending_schedule_intakes_one_open_fingerprint_idx') then
    raise exception 'Phase A+B catalog verification failed: uniqueness';
  end if;
  foreach v_name in array v_functions loop
    v_function := to_regprocedure('public.' || v_name);
    if v_function is null or exists (select 1 from pg_proc where oid = v_function
      and (not prosecdef or proowner <> 'postgres'::regrole
        or proconfig is distinct from array['search_path=pg_catalog, public'])) then
      raise exception 'Phase A+B catalog verification failed: function hardening';
    end if;
    if has_function_privilege('public', v_function, 'EXECUTE')
      or has_function_privilege('anon', v_function, 'EXECUTE')
      or has_function_privilege('authenticated', v_function, 'EXECUTE')
      or not has_function_privilege('service_role', v_function, 'EXECUTE') then
      raise exception 'Phase A+B catalog verification failed: function grants';
    end if;
  end loop;
  if position('clock_timestamp()' in pg_get_functiondef(
    'public.corralio_create_pending_schedule_intake_v1(uuid,uuid,text,text,uuid[],uuid[])'::regprocedure)) = 0
    or position('url_envelope = null' in lower(pg_get_functiondef(
      'public.corralio_finalize_pending_schedule_intake_v1(uuid,text,text,uuid)'::regprocedure))) = 0 then
    raise exception 'Phase A+B catalog verification failed: clock/secret lifecycle';
  end if;
end
$verify$;

select 'CORRALIO PHASE A+B CATALOG VERIFICATION PASSED'
  as corralio_phase_ab_catalog_verification;
