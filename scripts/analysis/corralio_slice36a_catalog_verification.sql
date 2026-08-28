do $verify$
declare
  v_timezone oid := 'public.corralio_set_household_timezone_v1(text)'::regprocedure;
  v_upsert oid := 'public.corralio_upsert_push_subscription_v1(uuid,uuid,text,text,text)'::regprocedure;
  v_deactivate oid := 'public.corralio_deactivate_push_subscription_v1(uuid,uuid,text)'::regprocedure;
  v_interaction oid := 'public.corralio_record_push_interaction_v1(uuid,uuid,text)'::regprocedure;
  v_member_trigger oid := 'public.corralio_deactivate_member_push_subscriptions_v1()'::regprocedure;
  v_claim oid := 'public.corralio_claim_weekend_ready_deliveries_v1(timestamptz,integer)'::regprocedure;
  v_finish oid := 'public.corralio_finish_weekend_ready_delivery_v1(uuid,uuid,text,text)'::regprocedure;
begin
  if (
    select count(*) <> 4
      or not coalesce(bool_and(c.relrowsecurity and c.relforcerowsecurity), false)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in (
        'corralio_push_subscriptions', 'corralio_weekend_ready_campaigns',
        'corralio_weekend_ready_deliveries', 'corralio_push_interactions'
      )
  ) then raise exception 'Slice 3.6A catalog verification failed: service-only RLS tables'; end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'corralio_push_subscriptions', 'corralio_weekend_ready_campaigns',
        'corralio_weekend_ready_deliveries', 'corralio_push_interactions'
      ) and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then raise exception 'Slice 3.6A catalog verification failed: untrusted table grant'; end if;

  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'corralio_push_subscriptions'
        and column_name in ('household_id','user_id','endpoint','endpoint_hash','p256dh','auth_secret','state')) <> 7
  then raise exception 'Slice 3.6A catalog verification failed: subscription columns'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'corralio_households'
      and column_name = 'planning_timezone' and is_nullable = 'YES'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.corralio_households'::regclass
      and conname = 'corralio_households_planning_timezone_check'
  ) then raise exception 'Slice 3.6A catalog verification failed: household timezone model'; end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'corralio_households'
      and indexname = 'corralio_households_planning_timezone_idx'
      and indexdef ilike '%planning_timezone%where (planning_timezone is not null)%'
  ) then raise exception 'Slice 3.6A catalog verification failed: bounded timezone lookup index'; end if;

  if has_column_privilege('authenticated', 'public.corralio_households', 'planning_timezone', 'UPDATE')
  then raise exception 'Slice 3.6A catalog verification failed: direct timezone update grant'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.corralio_push_subscriptions'::regclass
      and conname = 'corralio_push_subscriptions_endpoint_hash_unique'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.corralio_weekend_ready_campaigns'::regclass
      and conname = 'corralio_weekend_ready_campaigns_household_week_unique'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.corralio_weekend_ready_deliveries'::regclass
      and conname = 'corralio_weekend_ready_deliveries_campaign_subscription_unique'
  ) then raise exception 'Slice 3.6A catalog verification failed: two-level idempotency'; end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.corralio_household_members'::regclass
      and tgname = 'corralio_household_members_deactivate_push_subscriptions'
      and tgenabled <> 'D'
  ) then raise exception 'Slice 3.6A catalog verification failed: membership lifecycle trigger'; end if;

  if exists (
    select 1 from pg_proc p
    where p.oid in (v_timezone, v_upsert, v_deactivate, v_interaction, v_member_trigger, v_claim, v_finish)
      and (not p.prosecdef or p.proowner <> 'postgres'::regrole
        or p.proconfig is distinct from array['search_path=pg_catalog, public'])
  ) then raise exception 'Slice 3.6A catalog verification failed: function hardening'; end if;

  if not has_function_privilege('authenticated', v_timezone, 'EXECUTE')
     or has_function_privilege('anon', v_timezone, 'EXECUTE')
     or position('pg_timezone_names' in lower(pg_get_functiondef(v_timezone))) = 0
     or position('member.user_id = auth.uid()' in lower(pg_get_functiondef(v_timezone))) = 0
  then raise exception 'Slice 3.6A catalog verification failed: authorized timezone writer'; end if;

  if exists (
    select 1 from pg_proc p,
    lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid in (v_upsert, v_deactivate, v_interaction, v_member_trigger, v_claim, v_finish)
      and (acl.grantee = 0 or acl.grantee in ('anon'::regrole, 'authenticated'::regrole))
      and acl.privilege_type = 'EXECUTE'
  ) then raise exception 'Slice 3.6A catalog verification failed: untrusted function execute'; end if;

  if not has_function_privilege('service_role', v_upsert, 'EXECUTE')
     or not has_function_privilege('service_role', v_deactivate, 'EXECUTE')
     or not has_function_privilege('service_role', v_interaction, 'EXECUTE')
     or not has_function_privilege('service_role', v_claim, 'EXECUTE')
     or not has_function_privilege('service_role', v_finish, 'EXECUTE')
  then raise exception 'Slice 3.6A catalog verification failed: service function grants'; end if;

  if position('for update of delivery skip locked' in lower(pg_get_functiondef(v_claim))) = 0
     or position('least(greatest(coalesce(p_limit, 50), 1), 50)' in lower(pg_get_functiondef(v_claim))) = 0
     or position('delivery.attempt_count < 2' in lower(pg_get_functiondef(v_claim))) = 0
     or position('eligible_zones as materialized' in lower(pg_get_functiondef(v_claim))) = 0
     or position('extract(isodow from p_now at time zone zone.name) = 4' in lower(pg_get_functiondef(v_claim))) = 0
     or position('limit v_limit' in lower(pg_get_functiondef(v_claim))) = 0
  then raise exception 'Slice 3.6A catalog verification failed: bounded atomic claim'; end if;

  if position('event.timezone' in lower(pg_get_functiondef(v_claim))) > 0
     or position('origin_address' in lower(pg_get_functiondef(v_timezone))) > 0
  then raise exception 'Slice 3.6A catalog verification failed: timezone source separation'; end if;

  if position('state = ''accepted''' in lower(pg_get_functiondef(v_finish))) = 0
     or position('state = ''dead''' in lower(pg_get_functiondef(v_finish))) = 0
     or position('interval ''90 minutes''' in lower(pg_get_functiondef(v_finish))) = 0
  then raise exception 'Slice 3.6A catalog verification failed: finish/retry lifecycle'; end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.corralio_external_api_calls'::regclass
      and pg_get_constraintdef(oid) ilike '%web_push%'
  ) then raise exception 'Slice 3.6A catalog verification failed: routing ledger was widened'; end if;
end
$verify$;

select 'SLICE 3.6A CATALOG VERIFICATION PASSED'
  as corralio_slice36a_catalog_verification;
