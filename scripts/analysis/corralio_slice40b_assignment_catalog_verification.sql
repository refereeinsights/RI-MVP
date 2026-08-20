-- Read-only Corralio Slice 4.0B catalog verification.
-- Run only after manually applying the controlled migration. This script
-- creates no data and does not inspect private family or event content.

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  pg_get_userbyid(p.proowner) as owner,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'corralio_update_schedule_source_assignment_v1';

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'UPDATE')
    as authenticated_table_update
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('corralio_schedule_sources', 'corralio_events')
order by c.relname;

select
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'child_id', 'SELECT')
    as authenticated_can_read_source_child,
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'team_id', 'SELECT')
    as authenticated_can_read_source_team,
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'source_url', 'SELECT')
    as authenticated_can_read_source_url,
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'child_id', 'UPDATE')
    as authenticated_can_directly_update_source_child,
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'team_id', 'UPDATE')
    as authenticated_can_directly_update_source_team;

select
  a.attname as column_name,
  format_type(a.atttypid, a.atttypmod) as data_type,
  a.attnotnull as not_null
from pg_attribute a
where a.attrelid = 'public.corralio_events'::regclass
  and a.attname = 'origin_type'
  and a.attnum > 0
  and not a.attisdropped;

select origin_type, count(*) as row_count
from public.corralio_events
group by origin_type
order by origin_type;

select
  conrelid::regclass as table_name,
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
    'public.corralio_schedule_sources'::regclass,
    'public.corralio_events'::regclass,
    'public.corralio_teams'::regclass
  )
  and conname in (
    'corralio_schedule_sources_assignment_check',
    'corralio_schedule_sources_child_household_fk',
    'corralio_schedule_sources_team_household_fk',
    'corralio_events_assignment_check',
    'corralio_events_origin_type_check',
    'corralio_events_source_household_fk',
    'corralio_events_child_household_fk',
    'corralio_events_team_household_fk',
    'corralio_teams_child_household_fk'
  )
order by table_name::text, conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'corralio_events'
  and indexname = 'corralio_events_imported_identity_idx';

select c.relkind, n.nspname as schema_name, c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname ilike 'corralio%assignment%';

-- Expected:
-- - one postgres-owned boolean SECURITY DEFINER function with the exact three
--   uuid arguments and search_path locked to pg_catalog/public;
-- - anon=false, authenticated=true, service_role=true (bare service-role calls
--   still fail the function's auth.uid()/membership authorization);
-- - RLS remains enabled; authenticated has no table-level source UPDATE and no
--   child_id/team_id column UPDATE privilege;
-- - authenticated can read safe assignment IDs but not source_url;
-- - origin_type exists as non-null text, with the established manual/ics check;
-- - all existing assignment and household foreign-key constraints remain;
-- - the existing partial imported identity index remains available;
-- - no assignment-named table or index exists.
