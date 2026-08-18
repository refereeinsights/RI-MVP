-- Read-only Corralio Slice 3 catalog verification. Safe to run after the
-- controlled migration; it creates no data and does not invoke ingestion.

select
  p.proname,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
  pg_get_userbyid(p.proowner) as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'corralio_persist_ics_ingestion_v1';

-- Expected: one postgres-owned SECURITY DEFINER function, search_path locked to
-- pg_catalog/public, anon=false, authenticated=false, service_role=true.
