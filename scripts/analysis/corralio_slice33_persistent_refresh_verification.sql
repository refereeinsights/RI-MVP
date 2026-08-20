-- Corralio Slice 3.3 rollback-only behavioral verification.
-- Run only after manually applying the reviewed Slice 3.3 migration.
-- No external URL is fetched. All synthetic records are rolled back.

begin;

create or replace function pg_temp.corralio_slice33_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if p_condition is not true then
    raise exception 'Corralio Slice 3.3 verification failed: %', p_message;
  end if;
end;
$function$;

insert into public.corralio_households (id, display_name)
values ('ca330000-0000-4000-8000-000000000001', 'Slice 3.3 Synthetic Family');

insert into public.corralio_schedule_sources (
  id, household_id, source_type, display_name, source_url, sync_status,
  last_refresh_attempted_at
)
select
  ('00000000-0000-0000-0000-' || lpad((200 + series)::text, 12, '0'))::uuid,
  'ca330000-0000-4000-8000-000000000001'::uuid,
  'ics',
  'Slice 3.3 Source ' || series,
  'https://slice33.example.invalid/private-' || series || '.ics?token=synthetic-secret-' || series,
  'success',
  null
from generate_series(1, 12) series;

insert into public.corralio_events (
  household_id, origin_type, schedule_source_id, source_event_uid, title, starts_at
)
values (
  'ca330000-0000-4000-8000-000000000001'::uuid,
  'ics',
  '00000000-0000-0000-0000-000000000201'::uuid,
  'slice33-existing-game',
  'Existing Synthetic Game',
  '2026-08-22T17:00:00Z'::timestamptz
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

-- Fill the whole claim batch with deterministic low synthetic UUIDs so this
-- production-backed verification cannot claim an unrelated source.
create temporary table slice33_initial_claims on commit drop as
select * from public.corralio_claim_ics_refresh_batch_v1(10);

select pg_temp.corralio_slice33_assert(
  (select count(*) = 10 from slice33_initial_claims),
  'initial claim batch was not capped at 10'
);
select pg_temp.corralio_slice33_assert(
  (select count(*) = 10 from slice33_initial_claims where household_id = 'ca330000-0000-4000-8000-000000000001'::uuid),
  'initial claim batch touched a non-synthetic production source'
);

-- First qualifying failure.
select pg_temp.corralio_slice33_assert(
  public.corralio_fail_claimed_ics_refresh_v1(
    '00000000-0000-0000-0000-000000000201'::uuid,
    (select claim_token from slice33_initial_claims where source_id = '00000000-0000-0000-0000-000000000201'::uuid),
    'fetch_failed'
  ),
  'first legitimately claimed failure was not accepted'
);
select pg_temp.corralio_slice33_assert(
  exists (
    select 1 from public.corralio_schedule_sources
    where id = '00000000-0000-0000-0000-000000000201'::uuid
      and consecutive_refresh_failures = 1
      and refresh_paused_at is null
      and sync_status = 'error'
      and last_refresh_error_code = 'fetch_failed'
      and refresh_claim_token is null
  ),
  'first failure did not produce the transient retry state'
);

-- Make only the synthetic source immediately eligible again to simulate the
-- next daily window, then record the second failure.
update public.corralio_schedule_sources
set last_refresh_attempted_at = null
where id = '00000000-0000-0000-0000-000000000201'::uuid;
create temporary table slice33_second_attempt on commit drop as
select * from public.corralio_claim_ics_refresh_batch_v1(1);
select pg_temp.corralio_slice33_assert(
  (select source_id = '00000000-0000-0000-0000-000000000201'::uuid
     and household_id = 'ca330000-0000-4000-8000-000000000001'::uuid
   from slice33_second_attempt),
  'second attempt did not claim only the expected synthetic source'
);
select pg_temp.corralio_slice33_assert(
  public.corralio_fail_claimed_ics_refresh_v1(
    '00000000-0000-0000-0000-000000000201'::uuid,
    (select claim_token from slice33_second_attempt),
    'not_ics'
  ),
  'second legitimately claimed failure was not accepted'
);
select pg_temp.corralio_slice33_assert(
  exists (
    select 1 from public.corralio_schedule_sources
    where id = '00000000-0000-0000-0000-000000000201'::uuid
      and consecutive_refresh_failures = 2
      and refresh_paused_at is null
      and last_refresh_error_code = 'not_ics'
  ),
  'second failure did not remain retryable below the threshold'
);

-- Third qualifying failure reaches the exact threshold and pauses cron.
update public.corralio_schedule_sources
set last_refresh_attempted_at = null
where id = '00000000-0000-0000-0000-000000000201'::uuid;
create temporary table slice33_third_attempt on commit drop as
select * from public.corralio_claim_ics_refresh_batch_v1(1);
select pg_temp.corralio_slice33_assert(
  (select source_id = '00000000-0000-0000-0000-000000000201'::uuid
     and household_id = 'ca330000-0000-4000-8000-000000000001'::uuid
   from slice33_third_attempt),
  'third attempt did not claim only the expected synthetic source'
);
select pg_temp.corralio_slice33_assert(
  public.corralio_fail_claimed_ics_refresh_v1(
    '00000000-0000-0000-0000-000000000201'::uuid,
    (select claim_token from slice33_third_attempt),
    'fetch_failed'
  ),
  'third legitimately claimed failure was not accepted'
);
select pg_temp.corralio_slice33_assert(
  exists (
    select 1 from public.corralio_schedule_sources
    where id = '00000000-0000-0000-0000-000000000201'::uuid
      and consecutive_refresh_failures = 3
      and refresh_paused_at is not null
      and sync_status = 'error'
      and refresh_claim_token is null
      and source_url like 'https://slice33.example.invalid/%'
  ),
  'third failure did not produce the persistent pause state'
);
select pg_temp.corralio_slice33_assert(
  exists (
    select 1 from public.corralio_events
    where schedule_source_id = '00000000-0000-0000-0000-000000000201'::uuid
      and source_event_uid = 'slice33-existing-game'
  ),
  'threshold transition removed an existing imported event'
);

-- A paused source is excluded. The next claim must remain synthetic and must
-- not return the threshold source.
create temporary table slice33_after_pause_claim on commit drop as
select * from public.corralio_claim_ics_refresh_batch_v1(1);
select pg_temp.corralio_slice33_assert(
  (select count(*) = 1 from slice33_after_pause_claim
    where household_id = 'ca330000-0000-4000-8000-000000000001'::uuid
      and source_id <> '00000000-0000-0000-0000-000000000201'::uuid),
  'paused source remained eligible or a production source was claimed'
);

-- Unrecognized failure categories are rejected without changing state or
-- releasing the valid claim.
do $block$
begin
  perform public.corralio_fail_claimed_ics_refresh_v1(
    '00000000-0000-0000-0000-000000000203'::uuid,
    (select claim_token from slice33_initial_claims where source_id = '00000000-0000-0000-0000-000000000203'::uuid),
    'raw-provider-error'
  );
  raise exception 'unrecognized failure category unexpectedly succeeded';
exception
  when sqlstate '22023' then null;
end;
$block$;
select pg_temp.corralio_slice33_assert(
  exists (
    select 1 from public.corralio_schedule_sources
    where id = '00000000-0000-0000-0000-000000000203'::uuid
      and consecutive_refresh_failures = 0
      and refresh_claim_token is not null
  ),
  'unrecognized failure category mutated the source'
);

-- A mismatched token cannot increment or release another worker's claim.
select pg_temp.corralio_slice33_assert(
  not public.corralio_fail_claimed_ics_refresh_v1(
    '00000000-0000-0000-0000-000000000204'::uuid,
    '00000000-0000-0000-0000-000000009999'::uuid,
    'fetch_failed'
  ),
  'mismatched claim token unexpectedly finalized a failure'
);
select pg_temp.corralio_slice33_assert(
  exists (
    select 1 from public.corralio_schedule_sources
    where id = '00000000-0000-0000-0000-000000000204'::uuid
      and consecutive_refresh_failures = 0
      and refresh_claim_token is not null
  ),
  'mismatched claim token mutated the source'
);

-- A below-threshold source can recover through a later scheduled valid-empty
-- success. Canonical persistence resets all failure metadata.
select pg_temp.corralio_slice33_assert(
  public.corralio_fail_claimed_ics_refresh_v1(
    '00000000-0000-0000-0000-000000000202'::uuid,
    (select claim_token from slice33_initial_claims where source_id = '00000000-0000-0000-0000-000000000202'::uuid),
    'fetch_failed'
  ),
  'transient recovery fixture failure was not accepted'
);
update public.corralio_schedule_sources
set last_refresh_attempted_at = null
where id = '00000000-0000-0000-0000-000000000202'::uuid;
create temporary table slice33_recovery_claim on commit drop as
select * from public.corralio_claim_ics_refresh_batch_v1(1);
select pg_temp.corralio_slice33_assert(
  (select source_id = '00000000-0000-0000-0000-000000000202'::uuid
     and household_id = 'ca330000-0000-4000-8000-000000000001'::uuid
   from slice33_recovery_claim),
  'transient recovery did not claim only the expected synthetic source'
);
select * from public.corralio_persist_claimed_ics_refresh_v1(
  '00000000-0000-0000-0000-000000000202'::uuid,
  (select claim_token from slice33_recovery_claim),
  '[]'::jsonb,
  '{}'::text[]
);
select pg_temp.corralio_slice33_assert(
  exists (
    select 1 from public.corralio_schedule_sources
    where id = '00000000-0000-0000-0000-000000000202'::uuid
      and sync_status = 'success'
      and consecutive_refresh_failures = 0
      and refresh_paused_at is null
      and last_refresh_error_code is null
      and refresh_claim_token is null
  ),
  'valid-empty scheduled success did not reset transient failure state'
);

-- A paused source can recover only through a validated replacement. The
-- replacement is a trusted refresh and updates freshness in the same transaction.
update public.corralio_schedule_sources
set last_refresh_attempted_at = now() - interval '48 hours'
where id = '00000000-0000-0000-0000-000000000201'::uuid;
select * from public.corralio_replace_schedule_source_and_persist_ics_v1(
  'ca330000-0000-4000-8000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000201'::uuid,
  'https://slice33.example.invalid/recovered.ics?token=new-synthetic-secret',
  '[{"title":"Recovered Synthetic Game","starts_at":"2026-08-23T17:00:00Z","ends_at":null,"timezone":null,"source_event_uid":"slice33-recovered-game","source_location_text":"Synthetic Park","display_location_text":"Synthetic Park","field_label":null,"notes":null}]'::jsonb,
  '{}'::text[]
);
select pg_temp.corralio_slice33_assert(
  exists (
    select 1 from public.corralio_schedule_sources
    where id = '00000000-0000-0000-0000-000000000201'::uuid
      and sync_status = 'success'
      and consecutive_refresh_failures = 0
      and refresh_paused_at is null
      and last_refresh_error_code is null
      and last_refresh_attempted_at > now() - interval '1 hour'
      and source_url = 'https://slice33.example.invalid/recovered.ics?token=new-synthetic-secret'
  ),
  'validated URL replacement did not atomically recover the paused source'
);

-- A replacement that fails canonical validation rolls back URL, freshness,
-- and persistent-failure state together.
update public.corralio_schedule_sources
set sync_status = 'error',
    consecutive_refresh_failures = 3,
    refresh_paused_at = now() - interval '1 hour',
    last_refresh_attempted_at = now() - interval '48 hours',
    last_refresh_error_code = 'fetch_failed',
    refresh_claim_token = null,
    refresh_claimed_at = null
where id = '00000000-0000-0000-0000-000000000205'::uuid;
do $block$
begin
  perform * from public.corralio_replace_schedule_source_and_persist_ics_v1(
    'ca330000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000205'::uuid,
    'https://slice33.example.invalid/should-roll-back.ics?token=synthetic-secret',
    null,
    '{}'::text[]
  );
  raise exception 'invalid replacement unexpectedly succeeded';
exception
  when sqlstate '22023' then null;
end;
$block$;
select pg_temp.corralio_slice33_assert(
  exists (
    select 1 from public.corralio_schedule_sources
    where id = '00000000-0000-0000-0000-000000000205'::uuid
      and consecutive_refresh_failures = 3
      and refresh_paused_at is not null
      and last_refresh_attempted_at < now() - interval '47 hours'
      and last_refresh_error_code = 'fetch_failed'
      and source_url = 'https://slice33.example.invalid/private-5.ics?token=synthetic-secret-5'
  ),
  'failed URL replacement did not preserve the prior URL and failure state'
);

rollback;

-- After ROLLBACK, this must return zeroes.
select
  (select count(*) from public.corralio_households where display_name = 'Slice 3.3 Synthetic Family') as households,
  (select count(*) from public.corralio_schedule_sources where display_name like 'Slice 3.3 Source %') as sources,
  (select count(*) from public.corralio_events where source_event_uid in ('slice33-existing-game', 'slice33-recovered-game')) as events;
