-- Corralio Slice 3.1 rollback-only verification.
-- Run only after manually applying the reviewed Slice 3.1 migration.
-- No external URL is fetched. All synthetic data is rolled back.

begin;

create or replace function pg_temp.corralio_slice31_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if p_condition is not true then
    raise exception 'Corralio Slice 3.1 verification failed: %', p_message;
  end if;
end;
$function$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'ca310000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'corralio-slice31-a@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'ca310000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'corralio-slice31-b@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'ca310000-0000-4000-8000-000000000001', true);

do $test$
declare
  v_household_id uuid;
  v_source_id uuid;
  v_sport text;
begin
  v_household_id := public.corralio_ensure_owner_household('Slice 3.1 Family A');
  v_source_id := public.corralio_create_schedule_source_v2(
    v_household_id,
    'Slice 3.1 Soccer A',
    'https://slice31-a.example.invalid/private-a.ics',
    'soccer'
  );
  select sport into v_sport from public.corralio_schedule_sources where id = v_source_id;
  perform pg_temp.corralio_slice31_assert(v_sport = 'soccer', 'V2 creation did not persist source sport');

  perform public.corralio_update_schedule_source_sport_v1(v_source_id, 'volleyball');
  select sport into v_sport from public.corralio_schedule_sources where id = v_source_id;
  perform pg_temp.corralio_slice31_assert(v_sport = 'volleyball', 'owner could not edit source sport');

  begin
    perform public.corralio_update_schedule_source_sport_v1(v_source_id, 'curling');
    raise exception 'unsupported sport unexpectedly succeeded';
  exception when sqlstate '22023' then null;
  end;

  perform set_config('corralio.slice31.household_a', v_household_id::text, true);
  perform set_config('corralio.slice31.source_a', v_source_id::text, true);
end;
$test$;

-- The secret column remains unavailable even though safe metadata, including
-- sport, is readable by the authorized household owner.
do $test$
begin
  perform sport from public.corralio_schedule_sources limit 1;
  begin
    execute 'select source_url from public.corralio_schedule_sources limit 1';
    raise exception 'authenticated source_url SELECT unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.corralio_replace_schedule_source_url(
      current_setting('corralio.slice31.source_a')::uuid,
      'https://slice31-a.example.invalid/direct-replacement-must-fail.ics'
    );
    raise exception 'legacy direct replacement RPC unexpectedly remained authenticated';
  exception when insufficient_privilege then null;
  end;
end;
$test$;

select set_config('request.jwt.claim.sub', 'ca310000-0000-4000-8000-000000000002', true);
do $test$
declare
  v_household_id uuid;
  v_source_id uuid;
begin
  v_household_id := public.corralio_ensure_owner_household('Slice 3.1 Family B');
  v_source_id := public.corralio_create_schedule_source_v2(
    v_household_id,
    'Slice 3.1 Baseball B',
    'https://slice31-b.example.invalid/private-b.ics',
    'baseball'
  );
  perform set_config('corralio.slice31.household_b', v_household_id::text, true);
  perform set_config('corralio.slice31.source_b', v_source_id::text, true);
end;
$test$;

-- User A cannot edit User B's sport and receives the same generic denial.
select set_config('request.jwt.claim.sub', 'ca310000-0000-4000-8000-000000000001', true);
do $test$
begin
  begin
    perform public.corralio_update_schedule_source_sport_v1(
      current_setting('corralio.slice31.source_b')::uuid,
      'hockey'
    );
    raise exception 'cross-household sport update unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

-- Atomic replacement delegates to the canonical persistence RPC.
select *
from public.corralio_replace_schedule_source_and_persist_ics_v1(
  current_setting('corralio.slice31.household_a')::uuid,
  current_setting('corralio.slice31.source_a')::uuid,
  'https://slice31-a.example.invalid/private-replaced-a.ics',
  jsonb_build_array(jsonb_build_object(
    'title', 'Slice 3.1 Game',
    'starts_at', '2030-09-07T17:00:00Z',
    'ends_at', '2030-09-07T19:00:00Z',
    'timezone', 'America/Los_Angeles',
    'source_event_uid', 'slice31-game-a',
    'source_location_text', '123 Example Ave, Spokane, WA',
    'display_location_text', '123 Example Ave, Spokane, WA',
    'field_label', null,
    'notes', null
  )),
  '{}'::text[]
);

do $test$
declare
  v_source_url text;
  v_event_count integer;
  v_invalid_replacement_failed boolean := false;
  v_cross_household_failed boolean := false;
begin
  select source_url into v_source_url
  from public.corralio_schedule_sources
  where id = current_setting('corralio.slice31.source_a')::uuid;
  perform pg_temp.corralio_slice31_assert(
    v_source_url = 'https://slice31-a.example.invalid/private-replaced-a.ics',
    'successful atomic replacement did not commit the new URL'
  );

  select count(*) into v_event_count
  from public.corralio_events
  where schedule_source_id = current_setting('corralio.slice31.source_a')::uuid
    and source_event_uid = 'slice31-game-a';
  perform pg_temp.corralio_slice31_assert(v_event_count = 1, 'replacement did not persist the normalized event');

  -- The nested block is a subtransaction. The invalid event payload makes the
  -- canonical persistence RPC fail after the outer RPC updates the URL; catching
  -- it lets this script prove that both changes rolled back together.
  begin
    perform public.corralio_replace_schedule_source_and_persist_ics_v1(
      current_setting('corralio.slice31.household_a')::uuid,
      current_setting('corralio.slice31.source_a')::uuid,
      'https://slice31-a.example.invalid/must-not-commit.ics',
      '{}'::jsonb,
      '{}'::text[]
    );
  exception when others then
    v_invalid_replacement_failed := true;
  end;
  perform pg_temp.corralio_slice31_assert(
    v_invalid_replacement_failed,
    'invalid replacement payload unexpectedly succeeded'
  );

  select source_url into v_source_url
  from public.corralio_schedule_sources
  where id = current_setting('corralio.slice31.source_a')::uuid;
  perform pg_temp.corralio_slice31_assert(
    v_source_url = 'https://slice31-a.example.invalid/private-replaced-a.ics',
    'failed replacement changed the existing working URL'
  );

  begin
    perform public.corralio_replace_schedule_source_and_persist_ics_v1(
      current_setting('corralio.slice31.household_b')::uuid,
      current_setting('corralio.slice31.source_a')::uuid,
      'https://slice31-a.example.invalid/cross-household.ics',
      '[]'::jsonb,
      '{}'::text[]
    );
  exception when foreign_key_violation then
    v_cross_household_failed := true;
  end;
  perform pg_temp.corralio_slice31_assert(
    v_cross_household_failed,
    'cross-household replacement unexpectedly succeeded'
  );
end;
$test$;

reset role;
rollback;

-- Read-only catalog audit. Expected:
-- - sport is selectable by authenticated; source_url is not
-- - create V2 and sport update are authenticated + service-role callable
-- - atomic replacement is service-role only
-- - all three functions are postgres-owned SECURITY DEFINER with locked paths
select
  a.attname,
  has_column_privilege('authenticated', 'public.corralio_schedule_sources', a.attname, 'SELECT') as authenticated_select,
  has_column_privilege('service_role', 'public.corralio_schedule_sources', a.attname, 'SELECT') as service_role_select
from pg_attribute a
where a.attrelid = 'public.corralio_schedule_sources'::regclass
  and a.attname in ('sport', 'source_url')
order by a.attname;

select
  p.proname,
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
    'corralio_update_schedule_source_sport_v1',
    'corralio_replace_schedule_source_and_persist_ics_v1'
  )
order by p.proname;

select
  has_function_privilege('authenticated', 'public.corralio_replace_schedule_source_url(uuid,text)', 'EXECUTE')
    as authenticated_legacy_replace_execute;

-- Cleanup confirmation after ROLLBACK. Expected: all zero.
select
  (select count(*) from auth.users where email like 'corralio-slice31-%@example.invalid') as auth_users,
  (select count(*) from public.corralio_households where display_name like 'Slice 3.1 Family %') as households,
  (select count(*) from public.corralio_schedule_sources where display_name like 'Slice 3.1 %') as sources,
  (select count(*) from public.corralio_events where source_event_uid = 'slice31-game-a') as events;
