-- Read-only Corralio Slice 4.1B catalog verification.
-- Run only after the reviewed migration is manually applied. This script
-- creates no data and reads no private source URL or event content.

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
  and p.proname in (
    'corralio_disconnect_schedule_source_v1',
    'corralio_archive_team_v1',
    'corralio_archive_child_v1',
    'corralio_update_schedule_source_assignment_v1'
  )
order by p.proname;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_delete,
  has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_table_update,
  has_table_privilege('service_role', c.oid, 'DELETE') as service_role_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('corralio_children', 'corralio_teams', 'corralio_schedule_sources')
order by c.relname;

select
  has_column_privilege('authenticated', 'public.corralio_children', 'display_name', 'UPDATE')
    as child_name_update,
  has_column_privilege('authenticated', 'public.corralio_children', 'archived_at', 'UPDATE')
    as child_archive_update,
  has_column_privilege('authenticated', 'public.corralio_teams', 'display_name', 'UPDATE')
    as team_name_update,
  has_column_privilege('authenticated', 'public.corralio_teams', 'sport', 'UPDATE')
    as team_sport_update,
  has_column_privilege('authenticated', 'public.corralio_teams', 'archived_at', 'UPDATE')
    as team_archive_update,
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'source_url', 'SELECT')
    as source_url_select;

select policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename = 'corralio_schedule_sources'
  and cmd = 'DELETE';

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'corralio_events'
  and column_name in ('archived_at', 'suppressed_at', 'is_suppressed');

-- Expected:
-- - four postgres-owned boolean SECURITY DEFINER functions with locked
--   pg_catalog/public search paths; anon=false, authenticated/service_role=true;
-- - RLS remains enabled on all three tables;
-- - authenticated source DELETE and table-level child/team UPDATE are false;
-- - service-role source DELETE remains true for controlled cleanup;
-- - child/team name editing and team sport editing remain true;
-- - child/team archived_at UPDATE and source_url SELECT remain false;
-- - no authenticated source DELETE policy and no event suppression column.
