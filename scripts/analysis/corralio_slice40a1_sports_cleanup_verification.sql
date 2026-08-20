-- Read-only cleanup confirmation after the Slice 4.0A.1 rollback-only test.

select
  (select count(*)
   from auth.users
   where id in (
     'ca510000-0000-4000-8000-000000000001',
     'ca510000-0000-4000-8000-000000000002'
   )) as auth_users,
  (select count(*)
   from public.corralio_households
   where display_name like 'Slice 4.0A.1 Household%') as households,
  (select count(*)
   from public.corralio_children
   where id = 'ca520000-0000-4000-8000-000000000001') as children,
  (select count(*)
   from public.corralio_teams
   where id in (
     'ca530000-0000-4000-8000-000000000001',
     'ca530000-0000-4000-8000-000000000002'
   )) as teams,
  (select count(*)
   from public.corralio_schedule_sources
   where display_name like 'Slice 4.0A.1 %') as sources,
  (select count(*)
   from public.corralio_events event
   where exists (
     select 1
     from public.corralio_households household
     where household.id = event.household_id
       and household.display_name like 'Slice 4.0A.1 Household%'
   )) as events;

-- Expected: 0 | 0 | 0 | 0 | 0 | 0
