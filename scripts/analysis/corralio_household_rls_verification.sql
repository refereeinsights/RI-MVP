-- Corralio Slice 2 post-migration authorization verification.
--
-- READ BEFORE RUNNING:
-- - This script is intentionally NOT run by local validation.
-- - The repository's local apps use the production Supabase database.
-- - Run only after reviewing and manually applying
--   supabase/migrations/20260818_corralio_household_rls_foundation.sql.
-- - Run as a database owner during a controlled verification window.
-- - Every synthetic row is enclosed in one transaction and rolled back.
-- - If an assertion stops execution, issue ROLLBACK before doing anything else.

begin;

create or replace function pg_temp.corralio_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $function$
begin
  if p_condition is not true then
    raise exception 'Corralio verification failed: %', p_message;
  end if;
end;
$function$;

-- Synthetic Auth identities are transaction-local. They are deleted by the final
-- rollback and use reserved example.invalid addresses.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'ca110000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'corralio-rls-a@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'ca110000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'corralio-rls-b@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

-- Anonymous callers receive no table or RPC access.
set local role anon;
do $test$
begin
  begin
    perform count(*) from public.corralio_households;
    raise exception 'anonymous household SELECT unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.corralio_ensure_owner_household('Anonymous household');
    raise exception 'anonymous household RPC unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$test$;
reset role;

-- User A creates one household. Repeating the RPC is idempotent.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ca110000-0000-4000-8000-000000000001', true);
do $test$
declare
  v_first uuid;
  v_second uuid;
begin
  v_first := public.corralio_ensure_owner_household('Family A');
  v_second := public.corralio_ensure_owner_household('Ignored retry name');
  perform pg_temp.corralio_assert(v_first = v_second, 'household RPC retry was not idempotent');
end;
$test$;

insert into public.corralio_children (
  id, household_id, display_name, color_token, sort_order
)
select
  'ca120000-0000-4000-8000-000000000001', household_id, 'Child A', 'forest', 0
from public.corralio_household_members
where user_id = 'ca110000-0000-4000-8000-000000000001';

-- Kept unreferenced so household reassignment denial is tested directly rather
-- than being masked by a dependent-row foreign key.
insert into public.corralio_children (
  id, household_id, display_name, color_token, sort_order
)
select
  'ca120000-0000-4000-8000-000000000003',
  household_id,
  'Child A reassignment probe',
  'amber',
  1
from public.corralio_household_members
where user_id = 'ca110000-0000-4000-8000-000000000001';

insert into public.corralio_teams (
  id, household_id, child_id, display_name, sport, sort_order
)
select
  'ca130000-0000-4000-8000-000000000001',
  household_id,
  'ca120000-0000-4000-8000-000000000001',
  'Team A',
  'soccer',
  0
from public.corralio_household_members
where user_id = 'ca110000-0000-4000-8000-000000000001';

do $test$
declare
  v_household_id uuid;
  v_source_id uuid;
begin
  select household_id into strict v_household_id
  from public.corralio_household_members
  where user_id = 'ca110000-0000-4000-8000-000000000001';

  v_source_id := public.corralio_create_schedule_source(
    v_household_id,
    'Calendar A',
    'https://calendar-a.example.invalid/private-a.ics',
    null,
    'ca130000-0000-4000-8000-000000000001'
  );

  perform pg_temp.corralio_assert(v_source_id is not null, 'User A could not create Schedule Source A');
  perform public.corralio_replace_schedule_source_url(
    v_source_id,
    'https://calendar-a.example.invalid/replaced-private-a.ics'
  );
end;
$test$;

insert into public.corralio_events (
  id,
  household_id,
  origin_type,
  title,
  starts_at,
  ends_at,
  team_id
)
select
  'ca150000-0000-4000-8000-000000000001',
  household_id,
  'manual',
  'Manual Event A',
  '2030-01-01 10:00:00+00',
  '2030-01-01 11:00:00+00',
  'ca130000-0000-4000-8000-000000000001'
from public.corralio_household_members
where user_id = 'ca110000-0000-4000-8000-000000000001';

do $test$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.corralio_schedule_sources
  where display_name = 'Calendar A';
  perform pg_temp.corralio_assert(v_count = 1, 'User A cannot read safe Schedule Source A metadata');

  begin
    execute 'select source_url from public.corralio_schedule_sources limit 1';
    raise exception 'authenticated source_url SELECT unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    execute $sql$
      update public.corralio_schedule_sources
      set source_url = 'https://calendar-a.example.invalid/direct-update-must-fail.ics'
      where display_name = 'Calendar A'
    $sql$;
    raise exception 'authenticated direct source_url UPDATE unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.corralio_schedule_sources (
      household_id, display_name, source_url
    )
    select
      household_id,
      'Direct insert must fail',
      'https://calendar-a.example.invalid/direct-insert-must-fail.ics'
    from public.corralio_household_members
    where user_id = 'ca110000-0000-4000-8000-000000000001';
    raise exception 'authenticated direct schedule-source INSERT unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.corralio_household_members (household_id, user_id)
    select household_id, 'ca110000-0000-4000-8000-000000000002'
    from public.corralio_household_members
    where user_id = 'ca110000-0000-4000-8000-000000000001';
    raise exception 'direct membership write unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$test$;
reset role;

-- User B receives a fully separate household and source.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ca110000-0000-4000-8000-000000000002', true);
do $test$
declare
  v_household_id uuid;
  v_source_id uuid;
begin
  v_household_id := public.corralio_ensure_owner_household('Family B');
  v_source_id := public.corralio_create_schedule_source(
    v_household_id,
    'Calendar B',
    'https://calendar-b.example.invalid/private-b.ics'
  );

  -- Synthetic identifiers are deliberately exposed within this transaction so
  -- User A can attempt direct object-ID attacks against Household B.
  perform set_config('corralio.verification.household_b', v_household_id::text, true);
  perform set_config('corralio.verification.source_b', v_source_id::text, true);
end;
$test$;

insert into public.corralio_children (
  id, household_id, display_name, color_token, sort_order
)
select
  'ca120000-0000-4000-8000-000000000002', household_id, 'Child B', 'ocean', 0
from public.corralio_household_members
where user_id = 'ca110000-0000-4000-8000-000000000002';

insert into public.corralio_teams (
  id, household_id, child_id, display_name, sport, sort_order
)
select
  'ca130000-0000-4000-8000-000000000002',
  household_id,
  'ca120000-0000-4000-8000-000000000002',
  'Team B',
  'soccer',
  0
from public.corralio_household_members
where user_id = 'ca110000-0000-4000-8000-000000000002';

insert into public.corralio_events (
  id,
  household_id,
  origin_type,
  title,
  starts_at,
  ends_at,
  team_id
)
select
  'ca150000-0000-4000-8000-000000000003',
  household_id,
  'manual',
  'Manual Event B',
  '2030-01-03 10:00:00+00',
  '2030-01-03 11:00:00+00',
  'ca130000-0000-4000-8000-000000000002'
from public.corralio_household_members
where user_id = 'ca110000-0000-4000-8000-000000000002';

do $test$
declare
  v_a_rows bigint;
  v_b_rows bigint;
begin
  select count(*) filter (where display_name = 'Calendar A'),
         count(*) filter (where display_name = 'Calendar B')
    into v_a_rows, v_b_rows
  from public.corralio_schedule_sources;

  perform pg_temp.corralio_assert(v_a_rows = 0, 'User B can read Schedule Source A metadata');
  perform pg_temp.corralio_assert(v_b_rows = 1, 'User B cannot read Schedule Source B metadata');
end;
$test$;
reset role;

-- User A cannot access B rows or smuggle B entity IDs through composite FKs.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ca110000-0000-4000-8000-000000000001', true);
do $test$
declare
  v_a_household_id uuid;
  v_b_household_id uuid := current_setting('corralio.verification.household_b')::uuid;
  v_b_source_id uuid := current_setting('corralio.verification.source_b')::uuid;
  v_visible_b_children bigint;
  v_count bigint;
begin
  select household_id into strict v_a_household_id
  from public.corralio_household_members
  where user_id = 'ca110000-0000-4000-8000-000000000001';

  select count(*) into v_visible_b_children
  from public.corralio_children
  where id = 'ca120000-0000-4000-8000-000000000002';
  perform pg_temp.corralio_assert(v_visible_b_children = 0, 'User A can read Child B');

  begin
    update public.corralio_children
    set household_id = v_b_household_id
    where id = 'ca120000-0000-4000-8000-000000000003';
    get diagnostics v_count = row_count;
    if v_count > 0 then
      raise exception 'User A reassigned Child A into Household B';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.corralio_teams
    set household_id = v_b_household_id,
        child_id = 'ca120000-0000-4000-8000-000000000002'
    where id = 'ca130000-0000-4000-8000-000000000001';
    get diagnostics v_count = row_count;
    if v_count > 0 then
      raise exception 'User A reassigned Team A into Household B';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.corralio_events
    set household_id = v_b_household_id,
        team_id = 'ca130000-0000-4000-8000-000000000002'
    where id = 'ca150000-0000-4000-8000-000000000001';
    get diagnostics v_count = row_count;
    if v_count > 0 then
      raise exception 'User A reassigned Manual Event A into Household B';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.corralio_teams (
      household_id, child_id, display_name
    ) values (
      v_a_household_id,
      'ca120000-0000-4000-8000-000000000002',
      'Cross-household team'
    );
    raise exception 'cross-household child reference unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  begin
    perform public.corralio_replace_schedule_source_url(
      v_b_source_id,
      'https://calendar-b.example.invalid/user-a-must-not-replace.ics'
    );
    raise exception 'User A replaced Schedule Source B URL';
  exception
    when insufficient_privilege then null;
  end;

  delete from public.corralio_schedule_sources
  where id = v_b_source_id;
  get diagnostics v_count = row_count;
  perform pg_temp.corralio_assert(v_count = 0, 'User A deleted Schedule Source B');

  select count(*) into v_count
  from public.corralio_teams
  where id = 'ca130000-0000-4000-8000-000000000002';
  perform pg_temp.corralio_assert(v_count = 0, 'User A can read Team B');

  update public.corralio_teams
  set display_name = 'User A mutated Team B'
  where id = 'ca130000-0000-4000-8000-000000000002';
  get diagnostics v_count = row_count;
  perform pg_temp.corralio_assert(v_count = 0, 'User A updated Team B');

  select count(*) into v_count
  from public.corralio_events
  where id = 'ca150000-0000-4000-8000-000000000003';
  perform pg_temp.corralio_assert(v_count = 0, 'User A can read Event B');

  update public.corralio_events
  set title = 'User A mutated Event B'
  where id = 'ca150000-0000-4000-8000-000000000003';
  get diagnostics v_count = row_count;
  perform pg_temp.corralio_assert(v_count = 0, 'User A updated Event B');

  delete from public.corralio_events
  where id = 'ca150000-0000-4000-8000-000000000003';
  get diagnostics v_count = row_count;
  perform pg_temp.corralio_assert(v_count = 0, 'User A deleted Event B');

  update public.corralio_events
  set title = 'Manual Event A updated by owner'
  where id = 'ca150000-0000-4000-8000-000000000001';
  get diagnostics v_count = row_count;
  perform pg_temp.corralio_assert(v_count = 1, 'User A could not update Manual Event A');

  delete from public.corralio_events
  where id = 'ca150000-0000-4000-8000-000000000001';
  get diagnostics v_count = row_count;
  perform pg_temp.corralio_assert(v_count = 1, 'User A could not delete Manual Event A');
end;
$test$;
reset role;

-- Trusted server access can read URLs and write imported events.
set local role service_role;
do $test$
declare
  v_a_source_id uuid;
  v_a_household_id uuid;
  v_url text;
begin
  select id, household_id, source_url
    into strict v_a_source_id, v_a_household_id, v_url
  from public.corralio_schedule_sources
  where display_name = 'Calendar A';

  perform pg_temp.corralio_assert(
    v_url = 'https://calendar-a.example.invalid/replaced-private-a.ics',
    'service_role could not read the replaced Schedule Source A URL'
  );

  insert into public.corralio_events (
    id,
    household_id,
    origin_type,
    schedule_source_id,
    source_event_uid,
    title,
    starts_at
  ) values (
    'ca150000-0000-4000-8000-000000000002',
    v_a_household_id,
    'ics',
    v_a_source_id,
    'source-event-a-1',
    'Imported Event A',
    '2030-01-02 10:00:00+00'
  );
end;
$test$;
reset role;

-- User A can read but cannot alter or delete the imported event.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ca110000-0000-4000-8000-000000000001', true);
do $test$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.corralio_events
  where id = 'ca150000-0000-4000-8000-000000000002';
  perform pg_temp.corralio_assert(v_count = 1, 'User A cannot read imported Event A');

  update public.corralio_events
  set title = 'Client-mutated imported event'
  where id = 'ca150000-0000-4000-8000-000000000002';
  get diagnostics v_count = row_count;
  perform pg_temp.corralio_assert(v_count = 0, 'client updated an imported event');

  delete from public.corralio_events
  where id = 'ca150000-0000-4000-8000-000000000002';
  get diagnostics v_count = row_count;
  perform pg_temp.corralio_assert(v_count = 0, 'client deleted an imported event');
end;
$test$;
reset role;

-- Account deletion follows the membership FK's ON DELETE CASCADE but deliberately
-- leaves the ownerless household and its private records for a future explicit
-- account/household deletion design.
do $test$
declare
  v_a_household_id uuid;
  v_count bigint;
begin
  select household_id into strict v_a_household_id
  from public.corralio_household_members
  where user_id = 'ca110000-0000-4000-8000-000000000001';

  delete from auth.users
  where id = 'ca110000-0000-4000-8000-000000000001';

  select count(*) into v_count
  from public.corralio_household_members
  where user_id = 'ca110000-0000-4000-8000-000000000001';
  perform pg_temp.corralio_assert(v_count = 0, 'Auth deletion did not cascade the owner membership');

  select count(*) into v_count
  from public.corralio_households
  where id = v_a_household_id;
  perform pg_temp.corralio_assert(v_count = 1, 'Auth deletion unexpectedly deleted the household');

  select count(*) into v_count
  from public.corralio_children
  where household_id = v_a_household_id;
  perform pg_temp.corralio_assert(v_count = 2, 'Auth deletion unexpectedly deleted private household rows');
end;
$test$;

rollback;
