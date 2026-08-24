-- Read-only Corralio Slice 4.2A catalog verification.
-- Run only after a human applies both reviewed migrations, in documented order.

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  exists (
    select 1
    from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    where acl.grantee = 0
      and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) as public_any_row_access,
  has_table_privilege('anon', c.oid, 'SELECT')
    or has_table_privilege('anon', c.oid, 'INSERT')
    or has_table_privilege('anon', c.oid, 'UPDATE')
    or has_table_privilege('anon', c.oid, 'DELETE') as anon_any_row_access,
  has_table_privilege('authenticated', c.oid, 'SELECT')
    or has_table_privilege('authenticated', c.oid, 'INSERT')
    or has_table_privilege('authenticated', c.oid, 'UPDATE')
    or has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_any_row_access,
  has_table_privilege('service_role', c.oid, 'SELECT') as service_role_select,
  has_table_privilege('service_role', c.oid, 'INSERT')
    or has_table_privilege('service_role', c.oid, 'UPDATE')
    or has_table_privilege('service_role', c.oid, 'DELETE') as service_role_any_write
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'corralio_weekly_engagement';

select
  c.conname as constraint_name,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid = 'public.corralio_weekly_engagement'::regclass
  and c.conname = 'corralio_weekly_engagement_conflict_consistency';

select
  column_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'corralio_households'
  and column_name = 'acquisition_provenance';

select
  c.conname as constraint_name,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid = 'public.corralio_households'::regclass
  and c.conname = 'corralio_households_acquisition_provenance_check';

select
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'corralio_households'
  and trigger_name = 'corralio_households_lock_acquisition_provenance';

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  pg_get_userbyid(p.proowner) as owner,
  exists (
    select 1
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) as public_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'corralio_record_weekly_engagement_v1',
    'corralio_ensure_owner_household',
    'corralio_households_lock_acquisition_provenance'
  )
order by p.proname, identity_arguments;

-- Expected:
-- - weekly table: RLS true; public/anon/authenticated row access false;
--   service_role SELECT true and write false; exact consistency constraint;
-- - acquisition column: NOT NULL, default 'direct', exact two-value check;
-- - one BEFORE UPDATE lock trigger exists and its function owner is postgres;
-- - weekly RPC: postgres-owned SECURITY DEFINER, pg_catalog/public search path,
--   public/anon false and authenticated/service_role true;
-- - ensure-owner: exactly one text,text overload with the same owner/security/
--   search-path/grant contract; no remaining text-only overload.
