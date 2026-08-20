-- Corralio Slice 4.0A rollback-only behavioral verification.
-- Run only after manually applying the migration. Every synthetic row is
-- enclosed in this transaction and removed by the final ROLLBACK.

begin;

create or replace function pg_temp.corralio_slice40a_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if p_condition is not true then
    raise exception 'Corralio Slice 4.0A verification failed: %', p_message;
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
    'ca410000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'corralio-slice40a-a@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'ca410000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'corralio-slice40a-b@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ca410000-0000-4000-8000-000000000001', true);
select public.corralio_ensure_owner_household('Slice 4.0A Household A');
select set_config('request.jwt.claim.sub', 'ca410000-0000-4000-8000-000000000002', true);
select public.corralio_ensure_owner_household('Slice 4.0A Household B');

select set_config('request.jwt.claim.sub', 'ca410000-0000-4000-8000-000000000001', true);
insert into public.corralio_children (id, household_id, display_name, color_token, sort_order)
select 'ca420000-0000-4000-8000-000000000001', household_id, 'Slice 4.0A Child A1', 'forest', 0
from public.corralio_household_members
where user_id = 'ca410000-0000-4000-8000-000000000001';

insert into public.corralio_children (id, household_id, display_name, color_token, sort_order)
select 'ca420000-0000-4000-8000-000000000002', household_id, 'Slice 4.0A Child A2', 'ocean', 1
from public.corralio_household_members
where user_id = 'ca410000-0000-4000-8000-000000000001';

-- Separate siblings may have private team rows with the same display name.
insert into public.corralio_teams (id, household_id, child_id, display_name, sport, sort_order)
select 'ca430000-0000-4000-8000-000000000001', household_id,
  'ca420000-0000-4000-8000-000000000001', 'Shared Club Name', 'soccer', 0
from public.corralio_household_members
where user_id = 'ca410000-0000-4000-8000-000000000001';

insert into public.corralio_teams (id, household_id, child_id, display_name, sport, sort_order)
select 'ca430000-0000-4000-8000-000000000002', household_id,
  'ca420000-0000-4000-8000-000000000002', 'Shared Club Name', null, 0
from public.corralio_household_members
where user_id = 'ca410000-0000-4000-8000-000000000001';

update public.corralio_children
set display_name = 'Slice 4.0A Child A1 renamed'
where id = 'ca420000-0000-4000-8000-000000000001';
update public.corralio_teams
set display_name = 'Slice 4.0A Team renamed', sport = 'basketball'
where id = 'ca430000-0000-4000-8000-000000000001';

select pg_temp.corralio_slice40a_assert(
  (select count(*) = 2 from public.corralio_children),
  'User A could not read both active synthetic children'
);
select pg_temp.corralio_slice40a_assert(
  (select count(*) = 2 from public.corralio_teams),
  'User A could not read both same-named sibling team rows'
);

do $test$
declare
  v_household_id uuid;
begin
  select household_id into strict v_household_id
  from public.corralio_household_members
  where user_id = 'ca410000-0000-4000-8000-000000000001';

  begin
    insert into public.corralio_teams (
      id, household_id, child_id, display_name, sport, sort_order
    ) values (
      'ca430000-0000-4000-8000-000000000003', v_household_id,
      'ca420000-0000-4000-8000-000000000001', 'Unsupported sport probe', 'curling', 1
    );
    raise exception 'unsupported team sport unexpectedly succeeded';
  exception
    when check_violation then null;
  end;
end;
$test$;

-- User B cannot see or mutate User A family records.
select set_config('request.jwt.claim.sub', 'ca410000-0000-4000-8000-000000000002', true);
select pg_temp.corralio_slice40a_assert(
  (select count(*) = 0 from public.corralio_children),
  'User B could read User A children'
);
select pg_temp.corralio_slice40a_assert(
  (select count(*) = 0 from public.corralio_teams),
  'User B could read User A teams'
);
update public.corralio_teams
set display_name = 'Cross-household mutation'
where id = 'ca430000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub', 'ca410000-0000-4000-8000-000000000001', true);
select pg_temp.corralio_slice40a_assert(
  (select display_name = 'Slice 4.0A Team renamed'
   from public.corralio_teams
   where id = 'ca430000-0000-4000-8000-000000000001'),
  'User B changed User A team'
);

do $test$
declare
  v_household_b uuid;
begin
  select household_id into strict v_household_b
  from public.corralio_household_members
  where user_id = 'ca410000-0000-4000-8000-000000000002';

  begin
    update public.corralio_children
    set household_id = v_household_b
    where id = 'ca420000-0000-4000-8000-000000000001';
    raise exception 'child household reassignment unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$test$;

rollback;

-- Expected final statement: ROLLBACK. If an assertion interrupts execution,
-- issue ROLLBACK manually before running anything else.
