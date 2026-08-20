-- Read-only Corralio Slice 4.0A catalog verification.
-- Run only after manually applying the controlled migration. This script
-- creates no data and does not inspect private family names.

select
  count(*) filter (
    where sport is not null
      and sport not in (
        'baseball', 'softball', 'soccer', 'basketball', 'volleyball',
        'hockey', 'lacrosse', 'football', 'other'
      )
  ) as incompatible_team_sports
from public.corralio_teams;

select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.corralio_teams'::regclass
  and conname in (
    'corralio_teams_sport_check',
    'corralio_teams_child_household_fk'
  )
order by conname;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'SELECT') as anon_select,
  has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'SELECT') as authenticated_select,
  has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'INSERT') as authenticated_insert,
  has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'UPDATE') as authenticated_update,
  has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'DELETE') as authenticated_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('corralio_children', 'corralio_teams')
order by c.relname;

select
  tablename,
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('corralio_children', 'corralio_teams')
order by tablename, policyname;

-- Expected:
-- - incompatible_team_sports = 0;
-- - the exact sport constraint and composite child/household FK exist;
-- - RLS is enabled on both tables;
-- - anon has no SELECT;
-- - authenticated has SELECT/INSERT/UPDATE but no DELETE;
-- - all policies are restricted to authenticated household members.
