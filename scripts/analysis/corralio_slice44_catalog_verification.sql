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

do $verify$
declare
  v_columns text[];
  v_constraint_count integer;
  v_index_count integer;
  v_table_oid oid := 'public.corralio_event_venue_matches'::regclass;
begin
  select array_agg(column_name order by ordinal_position)
  into v_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'corralio_event_venue_matches';

  if v_columns is distinct from array[
    'event_id', 'household_id', 'venue_id', 'match_status',
    'location_fingerprint', 'matcher_version', 'evaluated_at',
    'matched_at', 'recheck_after'
  ]::text[] then
    raise exception 'Corralio Slice 4.4 catalog verification failed: unexpected columns %', v_columns;
  end if;

  select count(*) into v_constraint_count
  from pg_constraint
  where (conrelid = v_table_oid and conname in (
    'corralio_event_venue_matches_pkey',
    'corralio_event_venue_matches_event_household_fk',
    'corralio_event_venue_matches_status_check',
    'corralio_event_venue_matches_fingerprint_check',
    'corralio_event_venue_matches_matcher_version_check',
    'corralio_event_venue_matches_state_check',
    'corralio_event_venue_matches_time_check'
  )) or (
    conrelid = 'public.corralio_events'::regclass
    and conname = 'corralio_events_household_id_id_unique'
  );
  if v_constraint_count <> 8 then
    raise exception 'Corralio Slice 4.4 catalog verification failed: expected 8 constraints, found %', v_constraint_count;
  end if;

  select count(*) into v_index_count
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'corralio_event_venue_matches'
    and indexname in (
      'corralio_event_venue_matches_pkey',
      'corralio_event_venue_matches_household_status_idx',
      'corralio_event_venue_matches_recheck_idx'
    );
  if v_index_count <> 3 then
    raise exception 'Corralio Slice 4.4 catalog verification failed: expected 3 indexes, found %', v_index_count;
  end if;

  if not exists (
    select 1 from pg_class
    where oid = v_table_oid
      and relrowsecurity
      and relforcerowsecurity
      and pg_get_userbyid(relowner) = 'postgres'
  ) then
    raise exception 'Corralio Slice 4.4 catalog verification failed: owner/RLS boundary mismatch';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'corralio_event_venue_matches'
  ) then
    raise exception 'Corralio Slice 4.4 catalog verification failed: unexpected RLS policy';
  end if;

  if has_table_privilege('anon', v_table_oid, 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', v_table_oid, 'SELECT,INSERT,UPDATE,DELETE')
     or exists (
       select 1
       from pg_class c,
       lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
       where c.oid = v_table_oid
         and acl.grantee = 0
         and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
     ) then
    raise exception 'Corralio Slice 4.4 catalog verification failed: client/public row privilege exists';
  end if;

  if not has_table_privilege('service_role', v_table_oid, 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Corralio Slice 4.4 catalog verification failed: service_role row privileges missing';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venues_public'
      and column_name in ('latitude', 'longitude')
  ) then
    raise exception 'Corralio Slice 4.4 catalog verification failed: venues_public coordinate boundary changed';
  end if;
end;
$verify$;

select 'SLICE 4.4 CATALOG VERIFICATION PASSED' as corralio_slice44_catalog_verification;

-- Expected:
-- - exactly nine match-table columns with no raw location or canonical fields;
-- - one event PK, the household-safe composite event FK, all coherence checks,
--   and the supporting household/status and unmatched-recheck indexes;
-- - postgres ownership, enabled/forced RLS, no policies, no public/anon/
--   authenticated row privileges, and full service_role row privileges;
-- - venues_public remains the existing read boundary and is not extended with
--   latitude/longitude by the preferred relationship-only model.
