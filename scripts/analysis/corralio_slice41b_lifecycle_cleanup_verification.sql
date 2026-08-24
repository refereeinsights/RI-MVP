-- Read-only cleanup confirmation for the Slice 4.1B rollback-only fixture.
-- Run independently after behavioral verification. Every count must be zero.

select
  (select count(*) from auth.users where id in (
    'cb510000-0000-4000-8000-000000000001',
    'cb510000-0000-4000-8000-000000000002'
  )) as auth_users,
  (select count(*) from public.corralio_households
   where display_name in ('Slice 4.1B Household A', 'Slice 4.1B Household B')) as households,
  (select count(*) from public.corralio_household_members where user_id in (
    'cb510000-0000-4000-8000-000000000001',
    'cb510000-0000-4000-8000-000000000002'
  )) as memberships,
  (select count(*) from public.corralio_children where id in (
    'cb520000-0000-4000-8000-000000000001',
    'cb520000-0000-4000-8000-000000000002',
    'cb520000-0000-4000-8000-000000000003',
    'cb520000-0000-4000-8000-000000000004'
  )) as children,
  (select count(*) from public.corralio_teams where id in (
    'cb530000-0000-4000-8000-000000000001',
    'cb530000-0000-4000-8000-000000000002',
    'cb530000-0000-4000-8000-000000000003',
    'cb530000-0000-4000-8000-000000000004'
  )) as teams,
  (select count(*) from public.corralio_schedule_sources where id in (
    'cb540000-0000-4000-8000-000000000001',
    'cb540000-0000-4000-8000-000000000002',
    'cb540000-0000-4000-8000-000000000003',
    'cb540000-0000-4000-8000-000000000004',
    'cb540000-0000-4000-8000-000000000005',
    'cb540000-0000-4000-8000-000000000006'
  )) as sources,
  (select count(*) from public.corralio_events where id in (
    'cb550000-0000-4000-8000-000000000001',
    'cb550000-0000-4000-8000-000000000002',
    'cb550000-0000-4000-8000-000000000003',
    'cb550000-0000-4000-8000-000000000004',
    'cb550000-0000-4000-8000-000000000005',
    'cb550000-0000-4000-8000-000000000006',
    'cb550000-0000-4000-8000-000000000007'
  )) as events;

-- Expected: 0 / 0 / 0 / 0 / 0 / 0 / 0.
