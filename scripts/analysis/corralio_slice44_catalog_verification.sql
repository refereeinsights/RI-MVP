-- Read-only Corralio Slice 4.4 catalog verification.
-- Run only after a human applies the reviewed migration.

select
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'corralio_event_venue_matches'
order by c.ordinal_position;

select
  con.conname as constraint_name,
  con.contype as constraint_type,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
where con.conrelid in (
  'public.corralio_event_venue_matches'::regclass,
  'public.corralio_events'::regclass
)
  and con.conname in (
    'corralio_events_household_id_id_unique',
    'corralio_event_venue_matches_pkey',
    'corralio_event_venue_matches_event_household_fk',
    'corralio_event_venue_matches_status_check',
    'corralio_event_venue_matches_fingerprint_check',
    'corralio_event_venue_matches_matcher_version_check',
    'corralio_event_venue_matches_state_check',
    'corralio_event_venue_matches_time_check'
  )
order by con.conname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'corralio_event_venue_matches'
order by indexname;

select
  c.relname as table_name,
  pg_get_userbyid(c.relowner) as owner,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  exists (
    select 1
    from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    where acl.grantee = 0
      and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) as public_any_row_access,
  has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_any_row_access,
  has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as authenticated_any_row_access,
  has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as service_role_all_row_access
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'corralio_event_venue_matches';

select
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'corralio_event_venue_matches'
order by policyname;

select
  column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'venues_public'
order by ordinal_position;

-- Expected:
-- - exactly nine match-table columns with no raw location or canonical fields;
-- - one event PK, the household-safe composite event FK, all coherence checks,
--   and the supporting household/status and unmatched-recheck indexes;
-- - postgres ownership, enabled/forced RLS, no policies, no public/anon/
--   authenticated row privileges, and full service_role row privileges;
-- - venues_public remains the existing read boundary and is not extended with
--   latitude/longitude by the preferred relationship-only model.
