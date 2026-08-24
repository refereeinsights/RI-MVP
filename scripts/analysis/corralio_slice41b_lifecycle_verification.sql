-- Corralio Slice 4.1B rollback-only Household A/B verification.
-- All synthetic rows and the forced-failure trigger are rolled back. Reserved
-- .invalid URLs are persisted as inert strings and are never fetched.

begin;

create or replace function pg_temp.corralio_slice41b_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if p_condition is not true then
    raise exception 'Corralio Slice 4.1B verification failed: %', p_message;
  end if;
end;
$function$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'cb510000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'corralio-slice41b-a@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'cb510000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'corralio-slice41b-b@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'cb510000-0000-4000-8000-000000000001', true);
select set_config('corralio.verification.household_a', public.corralio_ensure_owner_household('Slice 4.1B Household A')::text, true);
select set_config('request.jwt.claim.sub', 'cb510000-0000-4000-8000-000000000002', true);
select set_config('corralio.verification.household_b', public.corralio_ensure_owner_household('Slice 4.1B Household B')::text, true);
reset role;

insert into public.corralio_children (id, household_id, display_name, color_token, sort_order)
values
  ('cb520000-0000-4000-8000-000000000001', current_setting('corralio.verification.household_a')::uuid, 'Slice 4.1B Child Team', 'forest', 0),
  ('cb520000-0000-4000-8000-000000000002', current_setting('corralio.verification.household_a')::uuid, 'Slice 4.1B Child Direct', 'ocean', 1),
  ('cb520000-0000-4000-8000-000000000003', current_setting('corralio.verification.household_a')::uuid, 'Slice 4.1B Child Failure', 'amber', 2),
  ('cb520000-0000-4000-8000-000000000004', current_setting('corralio.verification.household_b')::uuid, 'Slice 4.1B Child B', 'violet', 0);

insert into public.corralio_teams (id, household_id, child_id, display_name, sport, sort_order)
values
  ('cb530000-0000-4000-8000-000000000001', current_setting('corralio.verification.household_a')::uuid, 'cb520000-0000-4000-8000-000000000001', 'Slice 4.1B Team Remove', 'soccer', 0),
  ('cb530000-0000-4000-8000-000000000002', current_setting('corralio.verification.household_a')::uuid, 'cb520000-0000-4000-8000-000000000002', 'Slice 4.1B Team Cascade', 'baseball', 0),
  ('cb530000-0000-4000-8000-000000000003', current_setting('corralio.verification.household_a')::uuid, 'cb520000-0000-4000-8000-000000000003', 'Slice 4.1B Team Failure', 'lacrosse', 0),
  ('cb530000-0000-4000-8000-000000000004', current_setting('corralio.verification.household_b')::uuid, 'cb520000-0000-4000-8000-000000000004', 'Slice 4.1B Team B', 'soccer', 0);

insert into public.corralio_schedule_sources (
  id, household_id, source_type, display_name, source_url, sport, child_id, team_id,
  sync_status, last_synced_at, last_refresh_attempted_at, last_refresh_error_code,
  refresh_claim_token, refresh_claimed_at, consecutive_refresh_failures, refresh_paused_at
)
values
  ('cb540000-0000-4000-8000-000000000001', current_setting('corralio.verification.household_a')::uuid,
   'ics', 'Slice 4.1B Disconnect', 'https://slice41b.example.invalid/disconnect.ics', 'soccer', null, 'cb530000-0000-4000-8000-000000000001',
   'error', now() - interval '2 days', now() - interval '1 hour', 'fetch_failed',
   'cb560000-0000-4000-8000-000000000001', now(), 2, null),
  ('cb540000-0000-4000-8000-000000000002', current_setting('corralio.verification.household_a')::uuid,
   'ics', 'Slice 4.1B Team Connected', 'https://slice41b.example.invalid/team-connected.ics', 'soccer', null, 'cb530000-0000-4000-8000-000000000001',
   'success', now(), now(), null, null, null, 0, null),
  ('cb540000-0000-4000-8000-000000000003', current_setting('corralio.verification.household_a')::uuid,
   'ics', 'Slice 4.1B Child Direct', 'https://slice41b.example.invalid/child-direct.ics', 'baseball', 'cb520000-0000-4000-8000-000000000002', null,
   'success', now(), now(), null, null, null, 0, null),
  ('cb540000-0000-4000-8000-000000000004', current_setting('corralio.verification.household_a')::uuid,
   'ics', 'Slice 4.1B Child Team Disconnected', 'https://slice41b.example.invalid/child-team.ics', 'baseball', null, 'cb530000-0000-4000-8000-000000000002',
   'disconnected', now(), now(), null, null, null, 0, null),
  ('cb540000-0000-4000-8000-000000000005', current_setting('corralio.verification.household_a')::uuid,
   'ics', 'Slice 4.1B Failure', 'https://slice41b.example.invalid/failure.ics', 'lacrosse', null, 'cb530000-0000-4000-8000-000000000003',
   'success', now(), now(), null, null, null, 0, null),
  ('cb540000-0000-4000-8000-000000000006', current_setting('corralio.verification.household_b')::uuid,
   'ics', 'Slice 4.1B Control B', 'https://slice41b.example.invalid/control-b.ics', 'soccer', null, 'cb530000-0000-4000-8000-000000000004',
   'success', now(), now(), null, null, null, 0, null);

insert into public.corralio_events (
  id, household_id, origin_type, schedule_source_id, source_event_uid,
  title, starts_at, child_id, team_id
)
values
  ('cb550000-0000-4000-8000-000000000001', current_setting('corralio.verification.household_a')::uuid, 'ics', 'cb540000-0000-4000-8000-000000000001', 'slice41b-disconnect', 'Slice 4.1B Disconnect Event', now() + interval '1 day', null, 'cb530000-0000-4000-8000-000000000001'),
  ('cb550000-0000-4000-8000-000000000002', current_setting('corralio.verification.household_a')::uuid, 'ics', 'cb540000-0000-4000-8000-000000000002', 'slice41b-team', 'Slice 4.1B Team Event', now() + interval '1 day', null, 'cb530000-0000-4000-8000-000000000001'),
  ('cb550000-0000-4000-8000-000000000003', current_setting('corralio.verification.household_a')::uuid, 'ics', 'cb540000-0000-4000-8000-000000000003', 'slice41b-child-direct', 'Slice 4.1B Child Direct Event', now() + interval '1 day', 'cb520000-0000-4000-8000-000000000002', null),
  ('cb550000-0000-4000-8000-000000000004', current_setting('corralio.verification.household_a')::uuid, 'ics', 'cb540000-0000-4000-8000-000000000004', 'slice41b-child-team', 'Slice 4.1B Child Team Event', now() + interval '1 day', null, 'cb530000-0000-4000-8000-000000000002'),
  ('cb550000-0000-4000-8000-000000000005', current_setting('corralio.verification.household_a')::uuid, 'ics', 'cb540000-0000-4000-8000-000000000005', 'slice41b-failure', 'Slice 4.1B Failure Event', now() + interval '1 day', null, 'cb530000-0000-4000-8000-000000000003'),
  ('cb550000-0000-4000-8000-000000000006', current_setting('corralio.verification.household_a')::uuid, 'manual', null, null, 'Slice 4.1B Manual Event', now() + interval '1 day', 'cb520000-0000-4000-8000-000000000001', null),
  ('cb550000-0000-4000-8000-000000000007', current_setting('corralio.verification.household_b')::uuid, 'ics', 'cb540000-0000-4000-8000-000000000006', 'slice41b-control-b', 'Slice 4.1B Control Event', now() + interval '1 day', null, 'cb530000-0000-4000-8000-000000000004');

-- Owner A disconnects atomically; repeat and cross-household probes share false.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'cb510000-0000-4000-8000-000000000001', true);
select pg_temp.corralio_slice41b_assert(
  public.corralio_disconnect_schedule_source_v1('cb540000-0000-4000-8000-000000000001'),
  'authorized disconnect did not succeed'
);
select pg_temp.corralio_slice41b_assert(
  not public.corralio_disconnect_schedule_source_v1('cb540000-0000-4000-8000-000000000001'),
  'repeated disconnect did not return bounded false'
);
select pg_temp.corralio_slice41b_assert(
  not public.corralio_disconnect_schedule_source_v1('cb540000-0000-4000-8000-000000000006'),
  'foreign disconnect did not return bounded false'
);
reset role;

select pg_temp.corralio_slice41b_assert(
  (select sync_status = 'disconnected'
      and refresh_claim_token is null and refresh_claimed_at is null
      and last_synced_at is not null and last_refresh_attempted_at is not null
      and last_refresh_error_code = 'fetch_failed'
      and consecutive_refresh_failures = 2 and refresh_paused_at is null
      and team_id = 'cb530000-0000-4000-8000-000000000001'
      and source_url = 'https://slice41b.example.invalid/disconnect.ics'
   from public.corralio_schedule_sources where id = 'cb540000-0000-4000-8000-000000000001'),
  'disconnect changed retained URL, assignment, event history, or failure history'
);
select pg_temp.corralio_slice41b_assert(
  (select count(*) = 1 from public.corralio_events
   where id = 'cb550000-0000-4000-8000-000000000001'
     and team_id = 'cb530000-0000-4000-8000-000000000001'),
  'disconnect deleted or rewrote imported event assignment'
);

-- Team removal includes both connected and disconnected assigned sources.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'cb510000-0000-4000-8000-000000000001', true);
select pg_temp.corralio_slice41b_assert(
  public.corralio_archive_team_v1('cb530000-0000-4000-8000-000000000001'),
  'team removal did not succeed'
);
select pg_temp.corralio_slice41b_assert(
  not public.corralio_archive_team_v1('cb530000-0000-4000-8000-000000000001'),
  'repeated team removal did not return bounded false'
);
reset role;

select pg_temp.corralio_slice41b_assert(
  (select archived_at is not null from public.corralio_teams where id = 'cb530000-0000-4000-8000-000000000001'),
  'team was not archived'
);
select pg_temp.corralio_slice41b_assert(
  (select count(*) = 2 from public.corralio_schedule_sources
   where id in ('cb540000-0000-4000-8000-000000000001', 'cb540000-0000-4000-8000-000000000002')
     and child_id is null and team_id is null),
  'team sources were not unassigned'
);
select pg_temp.corralio_slice41b_assert(
  (select count(*) = 2 from public.corralio_events
   where id in ('cb550000-0000-4000-8000-000000000001', 'cb550000-0000-4000-8000-000000000002')
     and child_id is null and team_id is null),
  'team imported events were not unassigned'
);
select pg_temp.corralio_slice41b_assert(
  (select sync_status = 'success' from public.corralio_schedule_sources where id = 'cb540000-0000-4000-8000-000000000002'),
  'team removal disconnected an active source'
);

-- Child removal archives its active team and includes direct and disconnected team sources.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'cb510000-0000-4000-8000-000000000001', true);
select pg_temp.corralio_slice41b_assert(
  public.corralio_archive_child_v1('cb520000-0000-4000-8000-000000000002'),
  'child removal did not succeed'
);
select pg_temp.corralio_slice41b_assert(
  not public.corralio_archive_child_v1('cb520000-0000-4000-8000-000000000002'),
  'repeated child removal did not return bounded false'
);
reset role;

select pg_temp.corralio_slice41b_assert(
  (select archived_at is not null from public.corralio_children where id = 'cb520000-0000-4000-8000-000000000002')
  and (select archived_at is not null from public.corralio_teams where id = 'cb530000-0000-4000-8000-000000000002'),
  'child and active team were not archived together'
);
select pg_temp.corralio_slice41b_assert(
  (select count(*) = 2 from public.corralio_schedule_sources
   where id in ('cb540000-0000-4000-8000-000000000003', 'cb540000-0000-4000-8000-000000000004')
     and child_id is null and team_id is null),
  'direct/team child sources were not unassigned'
);
select pg_temp.corralio_slice41b_assert(
  (select count(*) = 2 from public.corralio_events
   where id in ('cb550000-0000-4000-8000-000000000003', 'cb550000-0000-4000-8000-000000000004')
     and child_id is null and team_id is null),
  'direct/team child imported events were not unassigned'
);
select pg_temp.corralio_slice41b_assert(
  (select child_id = 'cb520000-0000-4000-8000-000000000001'
   from public.corralio_events where id = 'cb550000-0000-4000-8000-000000000006'),
  'manual event was rewritten'
);
select pg_temp.corralio_slice41b_assert(
  (select team_id = 'cb530000-0000-4000-8000-000000000004'
      and sync_status = 'success'
   from public.corralio_schedule_sources where id = 'cb540000-0000-4000-8000-000000000006'),
  'Household B control source changed'
);

-- Direct browser-role source deletion and archive-state updates are denied;
-- normal name/sport editing remains available.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'cb510000-0000-4000-8000-000000000001', true);
do $test$
begin
  begin
    delete from public.corralio_schedule_sources where id = 'cb540000-0000-4000-8000-000000000005';
    raise exception using errcode = 'P0001', message = 'authenticated source delete unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when insufficient_privilege then null; end;
  begin
    update public.corralio_children set archived_at = now() where id = 'cb520000-0000-4000-8000-000000000003';
    raise exception using errcode = 'P0001', message = 'direct child archive unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when insufficient_privilege then null; end;
  begin
    update public.corralio_teams set archived_at = now() where id = 'cb530000-0000-4000-8000-000000000003';
    raise exception using errcode = 'P0001', message = 'direct team archive unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when insufficient_privilege then null; end;
end;
$test$;
update public.corralio_children set display_name = 'Slice 4.1B Child Failure Renamed' where id = 'cb520000-0000-4000-8000-000000000003';
update public.corralio_teams set display_name = 'Slice 4.1B Team Failure Renamed', sport = 'hockey' where id = 'cb530000-0000-4000-8000-000000000003';
reset role;

-- Force imported-event cleanup failure and prove team/source state rolls back.
create or replace function pg_temp.corralio_slice41b_force_event_failure()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'Synthetic lifecycle propagation failure' using errcode = 'P0002';
end;
$function$;

create trigger corralio_slice41b_forced_event_failure
before update on public.corralio_events
for each row
when (old.id = 'cb550000-0000-4000-8000-000000000005'::uuid)
execute function pg_temp.corralio_slice41b_force_event_failure();

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'cb510000-0000-4000-8000-000000000001', true);
do $test$
begin
  begin
    perform public.corralio_archive_team_v1('cb530000-0000-4000-8000-000000000003');
    raise exception using errcode = 'P0001', message = 'forced lifecycle failure unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when sqlstate 'P0002' then null; end;
end;
$test$;
reset role;
drop trigger corralio_slice41b_forced_event_failure on public.corralio_events;

select pg_temp.corralio_slice41b_assert(
  (select archived_at is null from public.corralio_teams where id = 'cb530000-0000-4000-8000-000000000003')
  and (select team_id = 'cb530000-0000-4000-8000-000000000003' from public.corralio_schedule_sources where id = 'cb540000-0000-4000-8000-000000000005')
  and (select team_id = 'cb530000-0000-4000-8000-000000000003' from public.corralio_events where id = 'cb550000-0000-4000-8000-000000000005'),
  'forced failure left partial lifecycle state'
);

-- Anonymous execution is denied. Bare service role has execute privilege but
-- no owner identity and receives the same bounded false result.
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
do $test$
begin
  begin
    perform public.corralio_archive_team_v1('cb530000-0000-4000-8000-000000000003');
    raise exception using errcode = 'P0001', message = 'anonymous lifecycle call unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when insufficient_privilege then null; end;
end;
$test$;
reset role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.corralio_slice41b_assert(
  not public.corralio_archive_team_v1('cb530000-0000-4000-8000-000000000003'),
  'bare service role did not receive bounded false'
);
reset role;

rollback;
