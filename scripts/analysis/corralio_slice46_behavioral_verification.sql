-- Network-free, rollback-only Slice 4.6 database behavioral verification.
begin;

create or replace function pg_temp.corralio_slice46_assert(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if p_condition is not true then raise exception 'Corralio Slice 4.6 verification failed: %', p_message; end if;
end;
$function$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'c4600000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'corralio-slice46@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.corralio_households (id, display_name)
values ('c4600000-0000-4000-8000-000000000011', 'Slice 4.6 Household');
insert into public.corralio_household_members (household_id, user_id, role, status)
values ('c4600000-0000-4000-8000-000000000011', 'c4600000-0000-4000-8000-000000000001', 'owner', 'active');
insert into public.corralio_children (id, household_id, display_name, color_token)
values ('c4600000-0000-4000-8000-000000000021', 'c4600000-0000-4000-8000-000000000011', 'Fixture Child', 'forest');
insert into public.corralio_teams (id, household_id, child_id, display_name, arrival_buffer_minutes)
values (
  'c4600000-0000-4000-8000-000000000031',
  'c4600000-0000-4000-8000-000000000011',
  'c4600000-0000-4000-8000-000000000021',
  'Fixture Team', 45
);
insert into public.corralio_schedule_sources (
  id, household_id, source_type, display_name, source_url, sync_status, team_id
) values (
  'c4600000-0000-4000-8000-000000000041',
  'c4600000-0000-4000-8000-000000000011', 'ics', 'Fixture Schedule',
  'https://example.invalid/private-fixture.ics', 'success',
  'c4600000-0000-4000-8000-000000000031'
);

do $test$
begin
  begin
    update public.corralio_teams set arrival_buffer_minutes = 43
    where id = 'c4600000-0000-4000-8000-000000000031';
    raise exception using errcode = 'P0001', message = 'invalid team arrival unexpectedly accepted';
  exception when sqlstate 'P0001' then raise; when check_violation then null; end;

  begin
    insert into public.corralio_events (
      household_id, origin_type, title, starts_at, schedule_arrival_at
    ) values (
      'c4600000-0000-4000-8000-000000000011', 'manual', 'Manual Fixture',
      '2026-09-01T18:00:00Z', '2026-09-01T17:30:00Z'
    );
    raise exception using errcode = 'P0001', message = 'manual typed arrival unexpectedly accepted';
  exception when sqlstate 'P0001' then raise; when check_violation then null; end;
end;
$test$;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select * from public.corralio_persist_ics_ingestion_v1(
  'c4600000-0000-4000-8000-000000000011',
  'c4600000-0000-4000-8000-000000000041',
  '[{"title":"Fixture Game","starts_at":"2026-09-01T18:00:00Z","ends_at":"2026-09-01T19:00:00Z","timezone":"UTC","source_event_uid":"fixture-game","source_location_text":"Fixture Sports Park","display_location_text":"Fixture Sports Park","field_label":null,"notes":"Arrive 5:30 PM","schedule_arrival_at":"2026-09-01T17:30:00Z"}]'::jsonb,
  '{}'::text[]
);
reset role;

select pg_temp.corralio_slice46_assert(
  (select schedule_arrival_at = '2026-09-01T17:30:00Z'::timestamptz
   from public.corralio_events
   where household_id = 'c4600000-0000-4000-8000-000000000011'
     and source_event_uid = 'fixture-game'),
  'typed exact arrival was not persisted'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c4600000-0000-4000-8000-000000000001', true);
update public.corralio_teams
set arrival_buffer_minutes = 50
where id = 'c4600000-0000-4000-8000-000000000031';
select public.corralio_create_schedule_source_v2(
  p_household_id => 'c4600000-0000-4000-8000-000000000011',
  p_display_name => 'Team-connected fixture',
  p_source_url => 'https://example.invalid/team-connected.ics',
  p_sport => 'soccer',
  p_child_id => null,
  p_team_id => 'c4600000-0000-4000-8000-000000000031'
);
select public.corralio_record_what_fits_event_v1(
  'candidate_selected', 'food', null, 'ics_explicit', 3, 1
);
reset role;

select pg_temp.corralio_slice46_assert(
  (select arrival_buffer_minutes = 50
   from public.corralio_teams
   where id = 'c4600000-0000-4000-8000-000000000031'),
  'authenticated owner could not update the team arrival preference'
);

select pg_temp.corralio_slice46_assert(
  (select count(*) = 1
   from public.corralio_schedule_sources
   where household_id = 'c4600000-0000-4000-8000-000000000011'
     and display_name = 'Team-connected fixture'
     and child_id is null
     and team_id = 'c4600000-0000-4000-8000-000000000031'),
  'team-connected source did not persist the team-only assignment'
);

select pg_temp.corralio_slice46_assert(
  (select count(*) = 1 from public.corralio_what_fits_events
   where household_id = 'c4600000-0000-4000-8000-000000000011'
     and event_name = 'candidate_selected' and mode = 'food'
     and reason is null and arrival_source = 'ics_explicit'
     and result_count = 3 and candidate_position = 1),
  'sanitized authenticated analytics event was not isolated to the owner household'
);

insert into public.corralio_external_api_calls (
  household_id, api, operation, status, error_code, retryable, billable, latency_ms
) values (
  'c4600000-0000-4000-8000-000000000011', 'openrouteservice',
  'route_what_fits', 'ok', null, null, true, 25
);

rollback;

do $cleanup$
begin
  if exists (select 1 from auth.users where id = 'c4600000-0000-4000-8000-000000000001')
     or exists (select 1 from public.corralio_households where id = 'c4600000-0000-4000-8000-000000000011')
     or exists (select 1 from public.corralio_household_members where household_id = 'c4600000-0000-4000-8000-000000000011')
     or exists (select 1 from public.corralio_children where id = 'c4600000-0000-4000-8000-000000000021')
     or exists (select 1 from public.corralio_teams where id = 'c4600000-0000-4000-8000-000000000031')
     or exists (select 1 from public.corralio_schedule_sources where id = 'c4600000-0000-4000-8000-000000000041')
     or exists (select 1 from public.corralio_events where household_id = 'c4600000-0000-4000-8000-000000000011')
     or exists (select 1 from public.corralio_what_fits_events where household_id = 'c4600000-0000-4000-8000-000000000011')
     or exists (select 1 from public.corralio_external_api_calls where household_id = 'c4600000-0000-4000-8000-000000000011')
  then raise exception 'Corralio Slice 4.6 cleanup verification failed'; end if;
end
$cleanup$;

select 'SLICE 4.6 BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO'
  as corralio_slice46_behavioral_verification;
