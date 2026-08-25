-- Read-only Corralio Slice 4.3 catalog verification.
-- Run only after a human applies the reviewed migration.

select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'corralio_households' and column_name like 'origin_%')
    or
    (table_name = 'corralio_events' and column_name in (
      'location_lat', 'location_lng', 'location_normalized',
      'location_geocoded_at', 'location_geocode_failed_at',
      'location_geocode_claimed_at', 'estimated_drive_minutes',
      'route_distance_meters', 'route_provider', 'route_failed_at',
      'route_claimed_at', 'leave_by_computed_at'
    ))
  )
order by table_name, ordinal_position;

select
  conrelid::regclass as table_name,
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.corralio_households'::regclass,
  'public.corralio_events'::regclass,
  'public.corralio_external_api_calls'::regclass,
  'public.corralio_external_call_daily_quota'::regclass
)
  and conname like 'corralio_%'
order by table_name::text, constraint_name;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  exists (
    select 1
    from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    where acl.grantee = 0
      and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) as public_any_row_access,
  has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_any_row_access,
  has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as authenticated_any_row_access,
  has_table_privilege('service_role', c.oid, 'SELECT') as service_role_select,
  has_table_privilege('service_role', c.oid, 'INSERT') as service_role_insert,
  has_table_privilege('service_role', c.oid, 'UPDATE') as service_role_update
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'corralio_external_api_calls',
    'corralio_external_call_daily_quota'
  )
order by c.relname;

select
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'corralio_events'
  and trigger_name = 'corralio_events_prepare_location';

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
    'corralio_events_prepare_location_v1',
    'corralio_prepare_household_origin_v1',
    'corralio_reserve_external_call_v1'
  )
order by p.proname, identity_arguments;

-- Expected:
-- - every new application column is nullable with no computation-triggering default;
-- - all coordinate, state-coherence, allowed-value, latency, and quota checks exist;
-- - both new tables have RLS, no public/anon/authenticated row access, and only
--   the documented service-role access;
-- - one BEFORE INSERT/UPDATE location trigger exists;
-- - all three functions are postgres-owned with pg_catalog/public search paths;
-- - prepare-origin is SECURITY DEFINER and executable only by authenticated and
--   service_role; reserve-quota and the trigger function have no client execute.
