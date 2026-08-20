-- Read-only Corralio Slice 4.0A.1 catalog verification.
-- Run only after manually applying the controlled migration. This script
-- creates no data and never selects a private schedule URL.

with canonical_sports(sport) as (
  values
    ('baseball'), ('softball'), ('soccer'), ('basketball'), ('volleyball'),
    ('hockey'), ('lacrosse'), ('football'), ('tennis'), ('swimming'),
    ('gymnastics'), ('track_field'), ('golf'), ('wrestling'), ('cheer'),
    ('dance'), ('other')
), enforcement(name, definition) as (
  select conname, pg_get_constraintdef(oid)
  from pg_constraint
  where conrelid in (
      'public.corralio_schedule_sources'::regclass,
      'public.corralio_teams'::regclass
    )
    and conname in (
      'corralio_schedule_sources_sport_check',
      'corralio_teams_sport_check'
    )
  union all
  select proname, pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'corralio_create_schedule_source_v2',
      'corralio_update_schedule_source_sport_v1'
    )
)
select
  (select count(*) = 17 from canonical_sports) as seventeen_tokens_declared,
  (select count(*) = 4 from enforcement) as four_enforcement_points_exist,
  not exists (
    select 1
    from canonical_sports sport
    cross join enforcement point
    where position(quote_literal(sport.sport) in point.definition) = 0
  ) as every_token_in_every_enforcement_point;

select
  c.conname,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid in (
    'public.corralio_schedule_sources'::regclass,
    'public.corralio_teams'::regclass
  )
  and c.conname in (
    'corralio_schedule_sources_sport_check',
    'corralio_teams_sport_check'
  )
order by c.conname;

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
    'corralio_create_schedule_source_v2',
    'corralio_update_schedule_source_sport_v1'
  )
order by p.proname;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'SELECT') as anon_select,
  has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'SELECT') as authenticated_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'corralio_children',
    'corralio_teams',
    'corralio_schedule_sources'
  )
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

select
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'sport', 'SELECT')
    as authenticated_can_read_sport,
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', 'source_url', 'SELECT')
    as authenticated_can_read_source_url,
  has_column_privilege('service_role', 'public.corralio_schedule_sources', 'source_url', 'SELECT')
    as service_role_can_read_source_url;

select
  count(*) filter (
    where sport is not null
      and sport not in (
        'baseball', 'softball', 'soccer', 'basketball', 'volleyball',
        'hockey', 'lacrosse', 'football', 'tennis', 'swimming',
        'gymnastics', 'track_field', 'golf', 'wrestling', 'cheer',
        'dance', 'other'
      )
  ) as incompatible_schedule_source_sports
from public.corralio_schedule_sources;

select
  count(*) filter (
    where sport is not null
      and sport not in (
        'baseball', 'softball', 'soccer', 'basketball', 'volleyball',
        'hockey', 'lacrosse', 'football', 'tennis', 'swimming',
        'gymnastics', 'track_field', 'golf', 'wrestling', 'cheer',
        'dance', 'other'
      )
  ) as incompatible_team_sports
from public.corralio_teams;

-- Expected:
-- - all three consolidated booleans are true;
-- - both exact constraints exist;
-- - both functions retain their exact signatures, postgres ownership,
--   SECURITY DEFINER, locked search_path, anon denial, and authenticated plus
--   service_role execution;
-- - RLS remains enabled and anon SELECT remains denied;
-- - child/team policies remain the existing authenticated-only
--   SELECT/INSERT/UPDATE policies, with no DELETE policy;
-- - authenticated can read sport but not source_url;
-- - service_role retains source_url access;
-- - both incompatible counts are zero.
