-- Read-only Corralio Slice 3.2 catalog verification.
-- Run only after the controlled migration. This script creates no data and
-- never selects a schedule source URL.

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'corralio_schedule_sources'
  and column_name in (
    'last_refresh_attempted_at',
    'last_refresh_error_code',
    'refresh_claim_token',
    'refresh_claimed_at'
  )
order by column_name;

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
  pg_get_userbyid(p.proowner) as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'corralio_claim_ics_refresh_batch_v1',
    'corralio_persist_claimed_ics_refresh_v1',
    'corralio_fail_claimed_ics_refresh_v1'
  )
order by p.proname;

select
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'last_refresh_attempted_at', 'SELECT')
    as authenticated_can_read_attempted_at,
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'last_refresh_error_code', 'SELECT')
    as authenticated_can_read_error_code,
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'refresh_claim_token', 'SELECT')
    as authenticated_can_read_claim_token,
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'refresh_claimed_at', 'SELECT')
    as authenticated_can_read_claimed_at,
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'source_url', 'SELECT')
    as authenticated_can_read_source_url,
  has_column_privilege('service_role', 'public.corralio_schedule_sources', 'source_url', 'SELECT')
    as service_role_can_read_source_url;

-- Expected:
-- - four operational columns exist;
-- - three postgres-owned SECURITY DEFINER RPCs with search_path locked;
-- - anon/authenticated execute=false and service_role execute=true for all three;
-- - authenticated can read the two safe status fields but not claim metadata or source_url;
-- - service_role can read source_url.
