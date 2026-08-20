-- Corralio Slice 4.0B rollback-only behavioral verification.
-- Run only after manually applying the migration. All synthetic rows and the
-- forced-failure trigger are enclosed in this transaction and rolled back.

begin;

create or replace function pg_temp.corralio_slice40b_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if p_condition is not true then
    raise exception 'Corralio Slice 4.0B verification failed: %', p_message;
  end if;
end;
$function$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'cb410000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'corralio-slice40b-a@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'cb410000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'corralio-slice40b-b@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'cb410000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'corralio-slice40b-no-household@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'cb410000-0000-4000-8000-000000000001', true);
select set_config('corralio.verification.household_a', public.corralio_ensure_owner_household('Slice 4.0B Household A')::text, true);
select set_config('request.jwt.claim.sub', 'cb410000-0000-4000-8000-000000000002', true);
select set_config('corralio.verification.household_b', public.corralio_ensure_owner_household('Slice 4.0B Household B')::text, true);
reset role;

insert into public.corralio_children (id, household_id, display_name, color_token, sort_order, archived_at)
values
  ('cb420000-0000-4000-8000-000000000001', current_setting('corralio.verification.household_a')::uuid, 'Synthetic Child A1', 'forest', 0, null),
  ('cb420000-0000-4000-8000-000000000002', current_setting('corralio.verification.household_a')::uuid, 'Synthetic Child A2', 'ocean', 1, null),
  ('cb420000-0000-4000-8000-000000000003', current_setting('corralio.verification.household_a')::uuid, 'Synthetic Archived Child', 'amber', 2, now()),
  ('cb420000-0000-4000-8000-000000000004', current_setting('corralio.verification.household_b')::uuid, 'Synthetic Child B1', 'violet', 0, null);

insert into public.corralio_teams (id, household_id, child_id, display_name, sport, sort_order, archived_at)
values
  ('cb430000-0000-4000-8000-000000000001', current_setting('corralio.verification.household_a')::uuid, 'cb420000-0000-4000-8000-000000000001', 'Synthetic Team A1', 'soccer', 0, null),
  ('cb430000-0000-4000-8000-000000000002', current_setting('corralio.verification.household_a')::uuid, 'cb420000-0000-4000-8000-000000000002', 'Synthetic Team A2', 'baseball', 0, null),
  ('cb430000-0000-4000-8000-000000000003', current_setting('corralio.verification.household_a')::uuid, 'cb420000-0000-4000-8000-000000000001', 'Synthetic Archived Team', 'soccer', 1, now()),
  ('cb430000-0000-4000-8000-000000000004', current_setting('corralio.verification.household_b')::uuid, 'cb420000-0000-4000-8000-000000000004', 'Synthetic Team B1', 'soccer', 0, null);

insert into public.corralio_schedule_sources (
  id, household_id, source_type, display_name, source_url, sport, sync_status,
  last_synced_at, last_refresh_attempted_at, last_refresh_error_code,
  refresh_claim_token, refresh_claimed_at, consecutive_refresh_failures, refresh_paused_at
)
values
  ('cb440000-0000-4000-8000-000000000001', current_setting('corralio.verification.household_a')::uuid,
   'ics', 'Synthetic Source A1', 'https://slice40b.example.invalid/a1.ics?token=synthetic', 'soccer', 'success',
   now() - interval '1 day', now() - interval '1 day', null,
   'cb460000-0000-4000-8000-000000000001', now(), 0, null),
  ('cb440000-0000-4000-8000-000000000002', current_setting('corralio.verification.household_a')::uuid,
   'ics', 'Synthetic Source A2', 'https://slice40b.example.invalid/a2.ics?token=synthetic', 'baseball', 'error',
   now() - interval '2 days', now() - interval '1 hour', 'fetch_failed', null, null, 2, null),
  ('cb440000-0000-4000-8000-000000000003', current_setting('corralio.verification.household_b')::uuid,
   'ics', 'Synthetic Source B1', 'https://slice40b.example.invalid/b1.ics?token=synthetic', 'soccer', 'success',
   now() - interval '1 day', now() - interval '1 day', null, null, null, 0, null),
  ('cb440000-0000-4000-8000-000000000004', current_setting('corralio.verification.household_a')::uuid,
   'ics', 'Synthetic Disconnected Source', 'https://slice40b.example.invalid/disconnected.ics?token=synthetic', 'soccer', 'disconnected',
   now() - interval '1 day', now() - interval '1 day', null, null, null, 0, null);

insert into public.corralio_events (
  id, household_id, origin_type, schedule_source_id, source_event_uid,
  title, starts_at, child_id, team_id
)
values
  ('cb450000-0000-4000-8000-000000000001', current_setting('corralio.verification.household_a')::uuid,
   'ics', 'cb440000-0000-4000-8000-000000000001', 'synthetic-a1-event-1', 'Synthetic Imported A1', now() + interval '1 day', null, null),
  ('cb450000-0000-4000-8000-000000000002', current_setting('corralio.verification.household_a')::uuid,
   'ics', 'cb440000-0000-4000-8000-000000000001', 'synthetic-a1-event-2', 'Synthetic Imported A2', now() + interval '2 days', null, null),
  ('cb450000-0000-4000-8000-000000000003', current_setting('corralio.verification.household_a')::uuid,
   'manual', null, null, 'Synthetic Manual A', now() + interval '1 day', 'cb420000-0000-4000-8000-000000000002', null),
  ('cb450000-0000-4000-8000-000000000004', current_setting('corralio.verification.household_a')::uuid,
   'ics', 'cb440000-0000-4000-8000-000000000002', 'synthetic-a2-event-1', 'Synthetic Other Source', now() + interval '1 day', null, null),
  ('cb450000-0000-4000-8000-000000000005', current_setting('corralio.verification.household_b')::uuid,
   'ics', 'cb440000-0000-4000-8000-000000000003', 'synthetic-b1-event-1', 'Synthetic Imported B1', now() + interval '1 day', null, null);

-- Child-only assignment propagates to only the exact source's imported events.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'cb410000-0000-4000-8000-000000000001', true);
select pg_temp.corralio_slice40b_assert(
  public.corralio_update_schedule_source_assignment_v1(
    'cb440000-0000-4000-8000-000000000001',
    'cb420000-0000-4000-8000-000000000001',
    null
  ),
  'child-only assignment did not return true'
);
reset role;

select pg_temp.corralio_slice40b_assert(
  (select child_id = 'cb420000-0000-4000-8000-000000000001' and team_id is null
   from public.corralio_schedule_sources where id = 'cb440000-0000-4000-8000-000000000001'),
  'source did not receive child-only assignment'
);
select pg_temp.corralio_slice40b_assert(
  (select count(*) = 2 from public.corralio_events
   where schedule_source_id = 'cb440000-0000-4000-8000-000000000001'
     and origin_type = 'ics'
     and child_id = 'cb420000-0000-4000-8000-000000000001'
     and team_id is null),
  'imported events did not receive child-only assignment'
);
select pg_temp.corralio_slice40b_assert(
  (select child_id = 'cb420000-0000-4000-8000-000000000002' and team_id is null
   from public.corralio_events where id = 'cb450000-0000-4000-8000-000000000003'),
  'manual event was changed by source assignment'
);
select pg_temp.corralio_slice40b_assert(
  (select child_id is null and team_id is null
   from public.corralio_events where id = 'cb450000-0000-4000-8000-000000000004'),
  'another source event was changed'
);
select pg_temp.corralio_slice40b_assert(
  (select child_id is null and team_id is null
   from public.corralio_events where id = 'cb450000-0000-4000-8000-000000000005'),
  'another household event was changed'
);
select pg_temp.corralio_slice40b_assert(
  (select source_url = 'https://slice40b.example.invalid/a1.ics?token=synthetic'
      and sport = 'soccer'
      and sync_status = 'success'
      and last_synced_at is not null
      and last_refresh_attempted_at is not null
      and last_refresh_error_code is null
      and refresh_claim_token = 'cb460000-0000-4000-8000-000000000001'
      and refresh_claimed_at is not null
      and consecutive_refresh_failures = 0
      and refresh_paused_at is null
   from public.corralio_schedule_sources where id = 'cb440000-0000-4000-8000-000000000001'),
  'assignment changed source URL, sport, refresh health, failure, or claim state'
);
select pg_temp.corralio_slice40b_assert(
  (select count(*) = 2 from public.corralio_events
   where id in ('cb450000-0000-4000-8000-000000000001', 'cb450000-0000-4000-8000-000000000002')
     and schedule_source_id = 'cb440000-0000-4000-8000-000000000001'
     and source_event_uid in ('synthetic-a1-event-1', 'synthetic-a1-event-2')),
  'assignment changed stable event IDs or source identity'
);

-- Team assignment uses child context but persists only the team ID.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb410000-0000-4000-8000-000000000001', true);
select pg_temp.corralio_slice40b_assert(
  public.corralio_update_schedule_source_assignment_v1(
    'cb440000-0000-4000-8000-000000000001',
    'cb420000-0000-4000-8000-000000000001',
    'cb430000-0000-4000-8000-000000000001'
  ),
  'team assignment did not return true'
);
reset role;
select pg_temp.corralio_slice40b_assert(
  (select child_id is null and team_id = 'cb430000-0000-4000-8000-000000000001'
   from public.corralio_schedule_sources where id = 'cb440000-0000-4000-8000-000000000001'),
  'source did not persist team-only assignment'
);
select pg_temp.corralio_slice40b_assert(
  (select count(*) = 2 from public.corralio_events
   where schedule_source_id = 'cb440000-0000-4000-8000-000000000001'
     and child_id is null
     and team_id = 'cb430000-0000-4000-8000-000000000001'),
  'events did not persist team-only assignment'
);

-- Failed validation must preserve the current source/event assignment.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb410000-0000-4000-8000-000000000001', true);
do $test$
begin
  begin
    perform public.corralio_update_schedule_source_assignment_v1(
      'cb440000-0000-4000-8000-000000000001', null, 'cb430000-0000-4000-8000-000000000001'
    );
    raise exception using errcode = 'P0001', message = 'team without child unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when others then null; end;

  begin
    perform public.corralio_update_schedule_source_assignment_v1(
      'cb440000-0000-4000-8000-000000000001',
      'cb420000-0000-4000-8000-000000000002',
      'cb430000-0000-4000-8000-000000000001'
    );
    raise exception using errcode = 'P0001', message = 'wrong-child team unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when others then null; end;

  begin
    perform public.corralio_update_schedule_source_assignment_v1(
      'cb440000-0000-4000-8000-000000000001', 'cb420000-0000-4000-8000-000000000003', null
    );
    raise exception using errcode = 'P0001', message = 'archived child unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when others then null; end;

  begin
    perform public.corralio_update_schedule_source_assignment_v1(
      'cb440000-0000-4000-8000-000000000001',
      'cb420000-0000-4000-8000-000000000001',
      'cb430000-0000-4000-8000-000000000003'
    );
    raise exception using errcode = 'P0001', message = 'archived team unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when others then null; end;

  begin
    perform public.corralio_update_schedule_source_assignment_v1(
      'cb440000-0000-4000-8000-000000000004', 'cb420000-0000-4000-8000-000000000001', null
    );
    raise exception using errcode = 'P0001', message = 'disconnected source unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when others then null; end;

  begin
    perform public.corralio_update_schedule_source_assignment_v1(
      'cb440000-0000-4000-8000-000000000001', 'cb420000-0000-4000-8000-000000000004', null
    );
    raise exception using errcode = 'P0001', message = 'cross-household child unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when others then null; end;

  begin
    perform public.corralio_update_schedule_source_assignment_v1(
      'cb440000-0000-4000-8000-000000000001',
      'cb420000-0000-4000-8000-000000000004',
      'cb430000-0000-4000-8000-000000000004'
    );
    raise exception using errcode = 'P0001', message = 'cross-household team unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when others then null; end;
end;
$test$;
reset role;

select pg_temp.corralio_slice40b_assert(
  (select child_id is null and team_id = 'cb430000-0000-4000-8000-000000000001'
   from public.corralio_schedule_sources where id = 'cb440000-0000-4000-8000-000000000001'),
  'failed validation changed source assignment'
);
select pg_temp.corralio_slice40b_assert(
  (select count(*) = 2 from public.corralio_events
   where schedule_source_id = 'cb440000-0000-4000-8000-000000000001'
     and child_id is null and team_id = 'cb430000-0000-4000-8000-000000000001'),
  'failed validation changed event assignments'
);

-- Household B cannot lock or assign Household A's source.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb410000-0000-4000-8000-000000000002', true);
do $test$
begin
  begin
    perform public.corralio_update_schedule_source_assignment_v1(
      'cb440000-0000-4000-8000-000000000001', 'cb420000-0000-4000-8000-000000000004', null
    );
    raise exception using errcode = 'P0001', message = 'cross-household source unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when others then null; end;
end;
$test$;

-- An authenticated user without active owner membership cannot assign.
select set_config('request.jwt.claim.sub', 'cb410000-0000-4000-8000-000000000003', true);
do $test$
begin
  begin
    perform public.corralio_update_schedule_source_assignment_v1(
      'cb440000-0000-4000-8000-000000000001', null, null
    );
    raise exception using errcode = 'P0001', message = 'non-owner unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when others then null; end;
end;
$test$;
reset role;

-- A bare service-role context has privilege but no owner identity and must fail.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
do $test$
begin
  begin
    perform public.corralio_update_schedule_source_assignment_v1(
      'cb440000-0000-4000-8000-000000000001', null, null
    );
    raise exception using errcode = 'P0001', message = 'bare service role unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when others then null; end;
end;
reset role;

-- Anonymous execution is denied by function privilege.
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
do $test$
begin
  begin
    perform public.corralio_update_schedule_source_assignment_v1(
      'cb440000-0000-4000-8000-000000000001', null, null
    );
    raise exception using errcode = 'P0001', message = 'anonymous call unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when others then null; end;
end;
reset role;

-- Force event propagation to fail and prove the source update rolls back too.
create or replace function pg_temp.corralio_slice40b_force_event_failure()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'Synthetic event propagation failure' using errcode = 'P0002';
end;
$function$;

create trigger corralio_slice40b_forced_event_failure
before update on public.corralio_events
for each row
when (old.schedule_source_id = 'cb440000-0000-4000-8000-000000000001'::uuid)
execute function pg_temp.corralio_slice40b_force_event_failure();

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'cb410000-0000-4000-8000-000000000001', true);
do $test$
begin
  begin
    perform public.corralio_update_schedule_source_assignment_v1(
      'cb440000-0000-4000-8000-000000000001', 'cb420000-0000-4000-8000-000000000002', null
    );
    raise exception using errcode = 'P0001', message = 'forced propagation failure unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when sqlstate 'P0002' then null; end;
end;
$test$;
reset role;
drop trigger corralio_slice40b_forced_event_failure on public.corralio_events;

select pg_temp.corralio_slice40b_assert(
  (select child_id is null and team_id = 'cb430000-0000-4000-8000-000000000001'
   from public.corralio_schedule_sources where id = 'cb440000-0000-4000-8000-000000000001'),
  'event failure did not roll back source assignment'
);

-- A valid empty canonical persistence call performs no fetch and preserves the
-- already-propagated assignment on existing events.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select * from public.corralio_persist_ics_ingestion_v1(
  current_setting('corralio.verification.household_a')::uuid,
  'cb440000-0000-4000-8000-000000000001',
  '[]'::jsonb,
  '{}'::text[]
);
reset role;
select pg_temp.corralio_slice40b_assert(
  (select count(*) = 2 from public.corralio_events
   where schedule_source_id = 'cb440000-0000-4000-8000-000000000001'
     and child_id is null
     and team_id = 'cb430000-0000-4000-8000-000000000001'),
  'valid empty canonical persistence changed existing assignment'
);

-- Call database-side canonical persistence directly with synthetic normalized
-- JSON. No URL read, network fetch, parser, cron route, or application path runs.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select * from public.corralio_persist_ics_ingestion_v1(
  current_setting('corralio.verification.household_a')::uuid,
  'cb440000-0000-4000-8000-000000000001',
  '[{"title":"Synthetic Canonical Event","starts_at":"2026-08-29T17:00:00Z","ends_at":null,"timezone":"UTC","source_event_uid":"synthetic-canonical-new","source_location_text":null,"display_location_text":null,"field_label":null,"notes":null}]'::jsonb,
  '{}'::text[]
);
reset role;

select pg_temp.corralio_slice40b_assert(
  (select child_id is null and team_id = 'cb430000-0000-4000-8000-000000000001'
   from public.corralio_events
   where schedule_source_id = 'cb440000-0000-4000-8000-000000000001'
     and source_event_uid = 'synthetic-canonical-new'),
  'canonical persistence did not preserve team assignment'
);

-- Successful validated replacement preserves assignment. A failed replacement
-- rolls back its candidate URL and leaves assignment unchanged.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select * from public.corralio_replace_schedule_source_and_persist_ics_v1(
  current_setting('corralio.verification.household_a')::uuid,
  'cb440000-0000-4000-8000-000000000001',
  'https://slice40b.example.invalid/replaced.ics?token=synthetic',
  '[{"title":"Synthetic Replacement Event","starts_at":"2026-08-30T17:00:00Z","ends_at":null,"timezone":"UTC","source_event_uid":"synthetic-replacement","source_location_text":null,"display_location_text":null,"field_label":null,"notes":null}]'::jsonb,
  '{}'::text[]
);

do $test$
begin
  begin
    perform * from public.corralio_replace_schedule_source_and_persist_ics_v1(
      current_setting('corralio.verification.household_a')::uuid,
      'cb440000-0000-4000-8000-000000000001',
      'https://slice40b.example.invalid/must-rollback.ics?token=synthetic',
      '[{"title":null,"starts_at":"2026-08-31T17:00:00Z","source_event_uid":"synthetic-invalid"}]'::jsonb,
      '{}'::text[]
    );
    raise exception using errcode = 'P0001', message = 'invalid replacement unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when others then null; end;
end;
$test$;
reset role;

select pg_temp.corralio_slice40b_assert(
  (select source_url = 'https://slice40b.example.invalid/replaced.ics?token=synthetic'
      and child_id is null
      and team_id = 'cb430000-0000-4000-8000-000000000001'
   from public.corralio_schedule_sources where id = 'cb440000-0000-4000-8000-000000000001'),
  'replacement failure changed URL or assignment'
);

-- Explicit unassignment clears source and all imported events without deleting.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'cb410000-0000-4000-8000-000000000001', true);
select pg_temp.corralio_slice40b_assert(
  public.corralio_update_schedule_source_assignment_v1(
    'cb440000-0000-4000-8000-000000000001', null, null
  ),
  'unassignment did not return true'
);
reset role;

select pg_temp.corralio_slice40b_assert(
  (select child_id is null and team_id is null
   from public.corralio_schedule_sources where id = 'cb440000-0000-4000-8000-000000000001'),
  'source was not unassigned'
);
select pg_temp.corralio_slice40b_assert(
  (select count(*) > 0 and bool_and(child_id is null and team_id is null)
   from public.corralio_events
   where household_id = current_setting('corralio.verification.household_a')::uuid
     and schedule_source_id = 'cb440000-0000-4000-8000-000000000001'
     and origin_type = 'ics'),
  'all imported source events were not unassigned'
);
select pg_temp.corralio_slice40b_assert(
  (select count(*) = 1 from public.corralio_schedule_sources where id = 'cb440000-0000-4000-8000-000000000001'),
  'unassignment deleted the source'
);
select pg_temp.corralio_slice40b_assert(
  (select count(*) >= 4 from public.corralio_events
   where household_id = current_setting('corralio.verification.household_a')::uuid),
  'unassignment deleted existing events'
);

rollback;

select
  (select count(*) from auth.users where id::text like 'cb41%') as auth_users,
  (select count(*) from public.corralio_households where display_name like 'Slice 4.0B Household%') as households,
  (select count(*) from public.corralio_children where id::text like 'cb42%') as children,
  (select count(*) from public.corralio_teams where id::text like 'cb43%') as teams,
  (select count(*) from public.corralio_schedule_sources where id::text like 'cb44%') as sources,
  (select count(*) from public.corralio_events where id::text like 'cb45%') as events;

-- Expected final transaction statement: ROLLBACK.
-- Expected cleanup counts: 0 / 0 / 0 / 0 / 0 / 0.
