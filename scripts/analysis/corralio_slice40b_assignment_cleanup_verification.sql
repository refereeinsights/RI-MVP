-- Read-only cleanup confirmation for the Corralio Slice 4.0B synthetic fixture.
-- Run after the rollback-only behavioral verification. Every count must be 0.

select
  (select count(*) from auth.users where id in (
    'cb410000-0000-4000-8000-000000000001',
    'cb410000-0000-4000-8000-000000000002',
    'cb410000-0000-4000-8000-000000000003'
  )) as auth_users,
  (select count(*) from public.corralio_households
   where display_name in ('Slice 4.0B Household A', 'Slice 4.0B Household B')) as households,
  (select count(*) from public.corralio_household_members where user_id in (
    'cb410000-0000-4000-8000-000000000001',
    'cb410000-0000-4000-8000-000000000002',
    'cb410000-0000-4000-8000-000000000003'
  )) as memberships,
  (select count(*) from public.corralio_children where id in (
    'cb420000-0000-4000-8000-000000000001',
    'cb420000-0000-4000-8000-000000000002',
    'cb420000-0000-4000-8000-000000000003',
    'cb420000-0000-4000-8000-000000000004'
  )) as children,
  (select count(*) from public.corralio_teams where id in (
    'cb430000-0000-4000-8000-000000000001',
    'cb430000-0000-4000-8000-000000000002',
    'cb430000-0000-4000-8000-000000000003',
    'cb430000-0000-4000-8000-000000000004'
  )) as teams,
  (select count(*) from public.corralio_schedule_sources where id in (
    'cb440000-0000-4000-8000-000000000001',
    'cb440000-0000-4000-8000-000000000002',
    'cb440000-0000-4000-8000-000000000003',
    'cb440000-0000-4000-8000-000000000004'
  )) as sources,
  (select count(*) from public.corralio_events where id in (
    'cb450000-0000-4000-8000-000000000001',
    'cb450000-0000-4000-8000-000000000002',
    'cb450000-0000-4000-8000-000000000003',
    'cb450000-0000-4000-8000-000000000004',
    'cb450000-0000-4000-8000-000000000005'
  ) or source_event_uid in ('synthetic-canonical-new', 'synthetic-replacement', 'synthetic-invalid')) as events;

-- Expected: 0 / 0 / 0 / 0 / 0 / 0 / 0.
