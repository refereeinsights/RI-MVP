-- Network-free, rollback-only Slice 3.6B Phase 1 behavioral verification.
begin;

create or replace function pg_temp.corralio_slice36b_assert(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if p_condition is not true then
    raise exception 'Corralio Slice 3.6B Phase 1 verification failed: %', p_message;
  end if;
end;
$function$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'c36b0000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'corralio-slice36b-owner@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c36b0000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'corralio-slice36b-other@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.corralio_households (id, display_name) values
  ('c36b0000-0000-4000-8000-000000000011', 'Slice 3.6B Household'),
  ('c36b0000-0000-4000-8000-000000000012', 'Slice 3.6B Other Household');
insert into public.corralio_household_members (household_id, user_id, role, status) values
  ('c36b0000-0000-4000-8000-000000000011', 'c36b0000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('c36b0000-0000-4000-8000-000000000012', 'c36b0000-0000-4000-8000-000000000002', 'owner', 'active');
insert into public.corralio_children (id, household_id, display_name, color_token) values
  ('c36b0000-0000-4000-8000-000000000021', 'c36b0000-0000-4000-8000-000000000011', 'Fixture Child', 'forest');
insert into public.corralio_teams (
  id, household_id, child_id, display_name, arrival_buffer_minutes
) values (
  'c36b0000-0000-4000-8000-000000000031',
  'c36b0000-0000-4000-8000-000000000011',
  'c36b0000-0000-4000-8000-000000000021',
  'Fixture Team', 55
);
insert into public.corralio_schedule_sources (
  id, household_id, source_type, display_name, source_url, sync_status, team_id
) values
  (
    'c36b0000-0000-4000-8000-000000000041',
    'c36b0000-0000-4000-8000-000000000011', 'ics', 'Assigned Fixture',
    'https://example.invalid/private-assigned.ics', 'success',
    'c36b0000-0000-4000-8000-000000000031'
  ),
  (
    'c36b0000-0000-4000-8000-000000000042',
    'c36b0000-0000-4000-8000-000000000011', 'ics', 'Unassigned Fixture',
    'https://example.invalid/private-unassigned.ics', 'success', null
  ),
  (
    'c36b0000-0000-4000-8000-000000000043',
    'c36b0000-0000-4000-8000-000000000012', 'ics', 'Other Fixture',
    'https://example.invalid/private-other.ics', 'success', null
  );
insert into public.corralio_events (
  id, household_id, origin_type, schedule_source_id, source_event_uid,
  title, starts_at, schedule_arrival_at, team_id
) values (
  'c36b0000-0000-4000-8000-000000000051',
  'c36b0000-0000-4000-8000-000000000011', 'ics',
  'c36b0000-0000-4000-8000-000000000041', 'slice36b-event',
  'Fixture Event', '2026-09-10T18:00:00Z', '2026-09-10T17:15:00Z',
  'c36b0000-0000-4000-8000-000000000031'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c36b0000-0000-4000-8000-000000000001', true);

select pg_temp.corralio_slice36b_assert(
  public.corralio_update_schedule_source_arrival_v1(
    'c36b0000-0000-4000-8000-000000000041'::uuid, 45::smallint
  ) = 45,
  'owner could not set assigned-source preference'
);
select pg_temp.corralio_slice36b_assert(
  public.corralio_update_schedule_source_arrival_v1(
    'c36b0000-0000-4000-8000-000000000042'::uuid, 20::smallint
  ) = 20,
  'owner could not set unassigned-source preference'
);

do $expected_denials$
begin
  begin
    perform public.corralio_update_schedule_source_arrival_v1(
      'c36b0000-0000-4000-8000-000000000043'::uuid, 30::smallint
    );
    raise exception using errcode = 'P0001', message = 'cross-household update unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when insufficient_privilege then null; end;

  begin
    perform public.corralio_update_schedule_source_arrival_v1(
      'c36b0000-0000-4000-8000-000000000041'::uuid, 43::smallint
    );
    raise exception using errcode = 'P0001', message = 'invalid preference unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when invalid_parameter_value then null; end;

  begin
    update public.corralio_schedule_sources
    set arrival_buffer_minutes = 30
    where id = 'c36b0000-0000-4000-8000-000000000041';
    raise exception using errcode = 'P0001', message = 'direct authenticated update unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when insufficient_privilege then null; end;
end;
$expected_denials$;

select public.corralio_update_schedule_source_arrival_v1(
  'c36b0000-0000-4000-8000-000000000042'::uuid, null::smallint
);
reset role;

select pg_temp.corralio_slice36b_assert(
  (select arrival_buffer_minutes = 45
   from public.corralio_schedule_sources
   where id = 'c36b0000-0000-4000-8000-000000000041'),
  'assigned-source preference did not persist'
);
select pg_temp.corralio_slice36b_assert(
  (select arrival_buffer_minutes is null
   from public.corralio_schedule_sources
   where id = 'c36b0000-0000-4000-8000-000000000042'),
  'clearing source preference did not restore fallback state'
);
select pg_temp.corralio_slice36b_assert(
  (select arrival_buffer_minutes is null
   from public.corralio_schedule_sources
   where id = 'c36b0000-0000-4000-8000-000000000043'),
  'cross-household source changed'
);
select pg_temp.corralio_slice36b_assert(
  (select arrival_buffer_minutes = 55
   from public.corralio_teams
   where id = 'c36b0000-0000-4000-8000-000000000031'),
  'source preference mutated the team'
);
select pg_temp.corralio_slice36b_assert(
  (select schedule_arrival_at = '2026-09-10T17:15:00Z'::timestamptz
   from public.corralio_events
   where id = 'c36b0000-0000-4000-8000-000000000051'),
  'source preference mutated feed-derived arrival'
);

rollback;

do $cleanup$
begin
  if exists (select 1 from auth.users where id in (
    'c36b0000-0000-4000-8000-000000000001',
    'c36b0000-0000-4000-8000-000000000002'
  )) or exists (select 1 from public.corralio_households where id in (
    'c36b0000-0000-4000-8000-000000000011',
    'c36b0000-0000-4000-8000-000000000012'
  )) or exists (select 1 from public.corralio_schedule_sources where id in (
    'c36b0000-0000-4000-8000-000000000041',
    'c36b0000-0000-4000-8000-000000000042',
    'c36b0000-0000-4000-8000-000000000043'
  )) or exists (select 1 from public.corralio_events where id =
    'c36b0000-0000-4000-8000-000000000051'
  ) then raise exception 'Slice 3.6B Phase 1 behavioral verification failed: rollback cleanup'; end if;
end;
$cleanup$;

select 'SLICE 3.6B PHASE 1 BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO'
  as corralio_slice36b_phase1_behavioral_verification;
