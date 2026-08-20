-- Corralio Slice 4.0A.1 rollback-only behavioral verification.
-- Run only after manually applying the migration. Every synthetic row is
-- enclosed in this transaction and removed by the final ROLLBACK.

begin;

create or replace function pg_temp.corralio_slice40a1_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if p_condition is not true then
    raise exception 'Corralio Slice 4.0A.1 verification failed: %', p_message;
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
    'ca510000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'corralio-slice40a1-a@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'ca510000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'corralio-slice40a1-b@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ca510000-0000-4000-8000-000000000001', true);
select set_config(
  'corralio.verification.household_a',
  public.corralio_ensure_owner_household('Slice 4.0A.1 Household A')::text,
  true
);
select set_config('request.jwt.claim.sub', 'ca510000-0000-4000-8000-000000000002', true);
select set_config(
  'corralio.verification.household_b',
  public.corralio_ensure_owner_household('Slice 4.0A.1 Household B')::text,
  true
);

select set_config('request.jwt.claim.sub', 'ca510000-0000-4000-8000-000000000001', true);
insert into public.corralio_children (id, household_id, display_name, color_token, sort_order)
values (
  'ca520000-0000-4000-8000-000000000001',
  current_setting('corralio.verification.household_a')::uuid,
  'Slice 4.0A.1 Child A',
  'forest',
  0
);

insert into public.corralio_teams (id, household_id, child_id, display_name, sport, sort_order)
values (
  'ca530000-0000-4000-8000-000000000001',
  current_setting('corralio.verification.household_a')::uuid,
  'ca520000-0000-4000-8000-000000000001',
  'Slice 4.0A.1 Tennis Team',
  'tennis',
  0
);

do $test$
declare
  v_household_a uuid := current_setting('corralio.verification.household_a')::uuid;
  v_source_tennis uuid;
  v_source_swimming uuid;
  v_source_track uuid;
  v_source_other uuid;
  v_source_soccer uuid;
begin
  v_source_tennis := public.corralio_create_schedule_source_v2(
    v_household_a, 'Slice 4.0A.1 Tennis',
    'https://slice40a1.example.invalid/tennis.ics', 'tennis', null, null
  );
  v_source_swimming := public.corralio_create_schedule_source_v2(
    v_household_a, 'Slice 4.0A.1 Swimming',
    'https://slice40a1.example.invalid/swimming.ics', 'swimming', null, null
  );
  v_source_track := public.corralio_create_schedule_source_v2(
    v_household_a, 'Slice 4.0A.1 Track',
    'https://slice40a1.example.invalid/track.ics', 'track_field',
    'ca520000-0000-4000-8000-000000000001', null
  );
  v_source_other := public.corralio_create_schedule_source_v2(
    v_household_a, 'Slice 4.0A.1 Other Sport',
    'https://slice40a1.example.invalid/other.ics', 'other', null, null
  );
  v_source_soccer := public.corralio_create_schedule_source_v2(
    v_household_a, 'Slice 4.0A.1 Soccer',
    'https://slice40a1.example.invalid/soccer.ics', 'soccer', null, null
  );

  perform pg_temp.corralio_slice40a1_assert(v_source_tennis is not null, 'Tennis source creation failed');
  perform pg_temp.corralio_slice40a1_assert(v_source_swimming is not null, 'Swimming source creation failed');
  perform pg_temp.corralio_slice40a1_assert(v_source_track is not null, 'Track & Field source creation failed');
  perform pg_temp.corralio_slice40a1_assert(v_source_other is not null, 'Other sport source creation failed');
  perform pg_temp.corralio_slice40a1_assert(v_source_soccer is not null, 'Existing Soccer source creation failed');
  perform set_config('corralio.verification.tennis_source', v_source_tennis::text, true);

  begin
    perform public.corralio_update_schedule_source_sport_v1(v_source_tennis, 'curling');
    raise exception 'arbitrary schedule-source sport unexpectedly succeeded';
  exception
    when invalid_parameter_value then null;
  end;
end;
$test$;

select pg_temp.corralio_slice40a1_assert(
  (select count(*) = 5
   from public.corralio_schedule_sources
   where household_id = current_setting('corralio.verification.household_a')::uuid
     and sport in ('tennis', 'swimming', 'track_field', 'other', 'soccer')),
  'expanded source sports were not stored exactly'
);
select pg_temp.corralio_slice40a1_assert(
  (select count(*) = 4
   from public.corralio_schedule_sources
   where household_id = current_setting('corralio.verification.household_a')::uuid
     and child_id is null
     and team_id is null),
  'sources unexpectedly require a team assignment'
);
select pg_temp.corralio_slice40a1_assert(
  (select child_id = 'ca520000-0000-4000-8000-000000000001' and team_id is null
   from public.corralio_schedule_sources
   where sport = 'track_field'
     and household_id = current_setting('corralio.verification.household_a')::uuid),
  'direct child assignment without a team was not preserved'
);

do $test$
begin
  begin
    insert into public.corralio_teams (
      id, household_id, child_id, display_name, sport, sort_order
    ) values (
      'ca530000-0000-4000-8000-000000000002',
      current_setting('corralio.verification.household_a')::uuid,
      'ca520000-0000-4000-8000-000000000001',
      'Unsupported sport probe',
      'curling',
      1
    );
    raise exception 'arbitrary team sport unexpectedly succeeded';
  exception
    when check_violation then null;
  end;
end;
$test$;

-- User B receives the same bounded denial for a missing or unauthorized source.
select set_config('request.jwt.claim.sub', 'ca510000-0000-4000-8000-000000000002', true);
do $test$
begin
  begin
    perform public.corralio_update_schedule_source_sport_v1(
      current_setting('corralio.verification.tennis_source')::uuid,
      'golf'
    );
    raise exception 'cross-household sport mutation unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$test$;

select set_config('request.jwt.claim.sub', 'ca510000-0000-4000-8000-000000000001', true);
select pg_temp.corralio_slice40a1_assert(
  (select sport = 'tennis'
   from public.corralio_schedule_sources
   where id = current_setting('corralio.verification.tennis_source')::uuid),
  'cross-household caller changed the Tennis source sport'
);

rollback;

-- Expected final statement: ROLLBACK. If an assertion interrupts execution,
-- issue ROLLBACK manually before doing anything else. Then run the separate
-- read-only zero-row cleanup query supplied with the implementation handoff.
