-- Read-only Corralio Slice 3.3 catalog verification.
-- Run only after the controlled migration. This script creates no data and
-- never selects a schedule source URL.

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'corralio_schedule_sources'
  and column_name in (
    'consecutive_refresh_failures',
    'refresh_paused_at',
    'last_refresh_attempted_at',
    'last_refresh_error_code',
    'refresh_claim_token',
    'refresh_claimed_at'
  )
order by column_name;

select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.corralio_schedule_sources'::regclass
  and conname in (
    'corralio_schedule_sources_refresh_failure_count_check',
    'corralio_schedule_sources_refresh_pause_state_check'
  )
order by conname;

select
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'corralio_schedule_sources';

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
    'corralio_persist_ics_ingestion_v1',
    'corralio_persist_claimed_ics_refresh_v1',
    'corralio_fail_claimed_ics_refresh_v1',
    'corralio_replace_schedule_source_and_persist_ics_v1'
  )
order by p.proname;

select
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'refresh_paused_at', 'SELECT')
    as authenticated_can_read_paused_at,
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'consecutive_refresh_failures', 'SELECT')
    as authenticated_can_read_failure_count,
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'refresh_claim_token', 'SELECT')
    as authenticated_can_read_claim_token,
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'refresh_claimed_at', 'SELECT')
    as authenticated_can_read_claimed_at,
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'source_url', 'SELECT')
    as authenticated_can_read_source_url,
  has_column_privilege('service_role', 'public.corralio_schedule_sources', 'source_url', 'SELECT')
    as service_role_can_read_source_url;

-- Expected:
-- - failure count is NOT NULL with default 0; pause timestamp is nullable;
-- - both count/pause consistency constraints exist;
-- - schedule-source RLS remains enabled;
-- - five trusted functions are postgres-owned SECURITY DEFINER with locked search_path;
-- - anon/authenticated execute=false and service_role execute=true;
-- - authenticated can read refresh_paused_at but cannot read the exact counter,
--   claim metadata, or source_url;
-- - service_role can read source_url.
