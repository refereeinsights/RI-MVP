-- Network-free, rollback-only Gate 3 durable SMS behavioral verification.
-- The separate concurrency verifier is required for true multi-session races.
begin;

create or replace function pg_temp.gate3_assert(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if p_condition is not true then raise exception 'Gate 3 verification failed: %', p_message; end if;
end;
$function$;

-- The reserved fixture namespace and database-authoritative UTC date must be
-- empty before the rollback-only verifier begins mutating its transaction.
select pg_temp.gate3_assert(
  not exists (select 1 from public.corralio_sms_webhook_claims where webhook_id like 'gate3_%')
  and not exists (select 1 from public.corralio_sms_test_allowlist where destination_hmac in (
    repeat('1',64),repeat('2',64),repeat('3',64),repeat('4',64),repeat('5',64),repeat('6',64),
    repeat('7',64),repeat('8',64),repeat('a',64),repeat('b',64),repeat('c',64),repeat('e',64)))
  and not exists (select 1 from public.corralio_sms_request_rate_state where bucket_hmac in (
    repeat('0',64),repeat('1',64),repeat('2',64),repeat('3',64),repeat('4',64),repeat('5',64),
    repeat('6',64),repeat('7',64),repeat('8',64),repeat('9',64),repeat('a',64),repeat('b',64),
    repeat('c',64),repeat('d',64),repeat('e',64),repeat('f',64)))
  and not exists (select 1 from public.corralio_sms_request_decisions where destination_hmac in (
    repeat('0',64),repeat('1',64),repeat('2',64),repeat('3',64),repeat('4',64),repeat('5',64),
    repeat('6',64),repeat('7',64),repeat('8',64),repeat('a',64),repeat('b',64),repeat('c',64),
    repeat('e',64),repeat('f',64)))
  and not exists (select 1 from public.corralio_sms_phone_send_permits where destination_hmac in (
    repeat('1',64),repeat('2',64),repeat('3',64),repeat('4',64),repeat('5',64),repeat('6',64),
    repeat('7',64),repeat('8',64),repeat('a',64),repeat('b',64),repeat('c',64),repeat('e',64)))
  and not exists (select 1 from public.corralio_sms_daily_segment_budgets
    where utc_date = (clock_timestamp() at time zone 'UTC')::date)
  and not exists (select 1 from public.corralio_sms_destination_segment_budgets
    where utc_date = (clock_timestamp() at time zone 'UTC')::date),
  'reserved fixture namespace/date was not empty before testing'
);

-- Disabled policy fails closed before any fixture enables it.
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select pg_temp.gate3_assert(
  (select decision = 'policy_disabled' from public.corralio_authorize_sms_otp_request_v1(
    repeat('0',64), repeat('0',64))),
  'disabled policy did not fail closed'
);
reset role;

update public.corralio_sms_test_policy set enabled = true, updated_at = '2026-08-31T12:00:00Z' where id = 1;
insert into public.corralio_sms_test_allowlist (destination_hmac) values
  (repeat('a',64)), (repeat('b',64)), (repeat('c',64)),
  (repeat('1',64)), (repeat('2',64)), (repeat('3',64)),
  (repeat('4',64)), (repeat('5',64)), (repeat('6',64)),
  (repeat('e',64)), (repeat('7',64)), (repeat('8',64));

-- A destination absent from the HMAC allowlist is denied before permit issue.
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select pg_temp.gate3_assert(
  (select decision = 'not_allowlisted' from public.corralio_authorize_sms_otp_request_v1(
    repeat('f',64), repeat('f',64))),
  'non-allowlisted destination was not denied'
);
reset role;

-- An expired permit closes terminally and cannot authorize a provider attempt.
insert into public.corralio_sms_phone_send_permits
  (destination_hmac, issued_at, expires_at, retain_until)
values
  (repeat('e',64), clock_timestamp() - interval '4 minutes',
    clock_timestamp() - interval '1 minute', clock_timestamp() + interval '7 days');
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select pg_temp.gate3_assert(
  (select decision = 'expired_permit' from public.corralio_authorize_sms_hook_attempt_v1(
    'gate3_expired', repeat('e',64), 1::smallint)),
  'expired permit did not close terminally'
);
reset role;
select pg_temp.gate3_assert(
  (select count(*) = 1 from public.corralio_sms_phone_send_permits
    where destination_hmac = repeat('e',64) and consumed_at is null
      and closed_at is not null and close_reason = 'expired'),
  'expired permit terminal state was incorrect'
);

select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select pg_temp.gate3_assert(
  (select decision = 'missing_permit' from public.corralio_authorize_sms_hook_attempt_v1(
    'gate3_missing', repeat('a',64), 1::smallint)),
  'direct hook was not denied'
);
select pg_temp.gate3_assert(
  (select decision = 'authorized' from public.corralio_authorize_sms_otp_request_v1(
    repeat('a',64), repeat('d',64))),
  'request did not issue a permit'
);
select pg_temp.gate3_assert(
  (select decision = 'cooldown' from public.corralio_authorize_sms_otp_request_v1(
    repeat('a',64), repeat('d',64))),
  'resend cooldown failed'
);
select pg_temp.gate3_assert(
  (select decision = 'authorized' from public.corralio_authorize_sms_hook_attempt_v1(
    'gate3_authorized', repeat('a',64), 1::smallint)),
  'valid hook did not authorize'
);
select pg_temp.gate3_assert(
  (select decision = 'duplicate' from public.corralio_authorize_sms_hook_attempt_v1(
    'gate3_authorized', repeat('a',64), 1::smallint)),
  'webhook replay was not bounded'
);
select pg_temp.gate3_assert(
  (select decision = 'missing_permit' from public.corralio_authorize_sms_hook_attempt_v1(
    'gate3_consumed_reuse', repeat('a',64), 1::smallint)),
  'consumed permit was reusable under a different webhook ID'
);
reset role;

select pg_temp.gate3_assert(
  (select count(*) = 1 from public.corralio_sms_webhook_claims
    where webhook_id = 'gate3_authorized' and decision = 'authorized'
      and provider_attempt_authorized_at is not null and reserved_segments = 1),
  'provider attempt authorization was not singular'
);
select pg_temp.gate3_assert(
  (select count(*) = 1 from public.corralio_sms_phone_send_permits
    where destination_hmac = repeat('a',64) and consumed_by_webhook_id = 'gate3_authorized'),
  'permit was not consumed once'
);
select pg_temp.gate3_assert(
  (select reserved_segments = 1 from public.corralio_sms_daily_segment_budgets
    where utc_date = (clock_timestamp() at time zone 'UTC')::date),
  'global segment was not permanently reserved'
);

-- Destination and IP hourly limits are durable database behavior, not mocked limits.
update public.corralio_sms_request_rate_state
set window_started_at = date_trunc('hour', clock_timestamp() at time zone 'UTC') at time zone 'UTC',
    request_count = 3, cooldown_until = clock_timestamp() - interval '1 second',
    updated_at = clock_timestamp()
where bucket_type = 'destination' and bucket_hmac = repeat('a',64);
insert into public.corralio_sms_request_rate_state
  (bucket_type, bucket_hmac, window_started_at, request_count, cooldown_until, updated_at)
values
  ('ip', repeat('9',64),
    date_trunc('hour', clock_timestamp() at time zone 'UTC') at time zone 'UTC',
    5, null, clock_timestamp());
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select pg_temp.gate3_assert(
  (select decision = 'rate_limited' from public.corralio_authorize_sms_otp_request_v1(
    repeat('a',64), repeat('d',64))),
  'per-destination hourly request limit failed'
);
select pg_temp.gate3_assert(
  (select decision = 'rate_limited' from public.corralio_authorize_sms_otp_request_v1(
    repeat('6',64), repeat('9',64))),
  'per-IP hourly request limit failed'
);
reset role;

-- A segment denial closes the matching permit and never increments a budget.
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select public.corralio_authorize_sms_otp_request_v1(
  repeat('b',64), repeat('e',64));
select pg_temp.gate3_assert(
  (select decision = 'segment_limit' from public.corralio_authorize_sms_hook_attempt_v1(
    'gate3_segment', repeat('b',64), 2::smallint)),
  'multi-segment hook was not denied'
);
reset role;
select pg_temp.gate3_assert(
  (select count(*) = 1 from public.corralio_sms_phone_send_permits
    where destination_hmac = repeat('b',64) and close_reason = 'segment_limit'),
  'denied permit remained usable'
);
select pg_temp.gate3_assert(
  (select reserved_segments = 1 from public.corralio_sms_daily_segment_budgets
    where utc_date = (clock_timestamp() at time zone 'UTC')::date),
  'segment denial changed budget'
);

-- Policy disablement invalidates the live permit before authorization.
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select public.corralio_authorize_sms_otp_request_v1(
  repeat('c',64), repeat('f',64));
reset role;
update public.corralio_sms_test_policy set enabled = false where id = 1;
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select pg_temp.gate3_assert(
  (select decision = 'policy_disabled' from public.corralio_authorize_sms_hook_attempt_v1(
    'gate3_disabled', repeat('c',64), 1::smallint)),
  'policy disablement did not win'
);
reset role;

-- Global and destination budget denials close permits without consuming them or
-- changing either counter.
update public.corralio_sms_test_policy set enabled = true where id = 1;
update public.corralio_sms_daily_segment_budgets
  set reserved_segments = 20, updated_at = clock_timestamp()
  where utc_date = (clock_timestamp() at time zone 'UTC')::date;
insert into public.corralio_sms_phone_send_permits
  (destination_hmac, issued_at, expires_at, retain_until)
values
  (repeat('7',64), clock_timestamp(), clock_timestamp() + interval '3 minutes',
    clock_timestamp() + interval '7 days');
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select pg_temp.gate3_assert(
  (select decision = 'global_cap' from public.corralio_authorize_sms_hook_attempt_v1(
    'gate3_global_cap', repeat('7',64), 1::smallint)),
  'global cap was not enforced'
);
reset role;
select pg_temp.gate3_assert(
  (select reserved_segments = 20 from public.corralio_sms_daily_segment_budgets
    where utc_date = (clock_timestamp() at time zone 'UTC')::date),
  'global cap denial changed the global counter'
);
select pg_temp.gate3_assert(
  (select count(*) = 1 from public.corralio_sms_phone_send_permits
    where destination_hmac = repeat('7',64) and consumed_at is null
      and close_reason = 'global_cap'),
  'global cap denial consumed or failed to close the permit'
);

update public.corralio_sms_daily_segment_budgets
  set reserved_segments = 0, updated_at = clock_timestamp()
  where utc_date = (clock_timestamp() at time zone 'UTC')::date;
insert into public.corralio_sms_destination_segment_budgets
  (utc_date, destination_hmac, reserved_segments, updated_at)
values
  ((clock_timestamp() at time zone 'UTC')::date, repeat('8',64), 5, clock_timestamp());
insert into public.corralio_sms_phone_send_permits
  (destination_hmac, issued_at, expires_at, retain_until)
values
  (repeat('8',64), clock_timestamp(), clock_timestamp() + interval '3 minutes',
    clock_timestamp() + interval '7 days');
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select pg_temp.gate3_assert(
  (select decision = 'destination_cap' from public.corralio_authorize_sms_hook_attempt_v1(
    'gate3_destination_cap', repeat('8',64), 1::smallint)),
  'destination cap was not enforced'
);
reset role;
select pg_temp.gate3_assert(
  (select reserved_segments = 0 from public.corralio_sms_daily_segment_budgets
    where utc_date = (clock_timestamp() at time zone 'UTC')::date),
  'destination cap denial changed the global counter'
);
select pg_temp.gate3_assert(
  (select reserved_segments = 5 from public.corralio_sms_destination_segment_budgets
    where utc_date = (clock_timestamp() at time zone 'UTC')::date
      and destination_hmac = repeat('8',64)),
  'destination cap denial changed the destination counter'
);
select pg_temp.gate3_assert(
  (select count(*) = 1 from public.corralio_sms_phone_send_permits
    where destination_hmac = repeat('8',64) and consumed_at is null
      and close_reason = 'destination_cap'),
  'destination cap denial consumed or failed to close the permit'
);
select pg_temp.gate3_assert(
  (select count(*) = 1 from public.corralio_sms_webhook_claims
    where webhook_id = 'gate3_destination_cap' and decision = 'destination_cap'
      and provider_attempt_authorized_at is null and reserved_segments = 0),
  'destination cap claim authorized a provider attempt'
);

-- Ordinary roles have neither table nor RPC authority.
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
do $untrusted$
begin
  begin perform count(*) from public.corralio_sms_test_policy;
    raise exception 'authenticated table read unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.corralio_authorize_sms_otp_request_v1(repeat('a',64), repeat('d',64));
    raise exception 'authenticated RPC unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end
$untrusted$;
reset role;

rollback;

do $cleanup$
begin
  if exists (select 1 from public.corralio_sms_webhook_claims where webhook_id like 'gate3_%')
     or exists (select 1 from public.corralio_sms_test_allowlist where destination_hmac in (
       repeat('1',64),repeat('2',64),repeat('3',64),repeat('4',64),repeat('5',64),repeat('6',64),
       repeat('7',64),repeat('8',64),repeat('a',64),repeat('b',64),repeat('c',64),repeat('e',64)))
     or exists (select 1 from public.corralio_sms_request_rate_state where bucket_hmac in (
       repeat('0',64),repeat('1',64),repeat('2',64),repeat('3',64),repeat('4',64),repeat('5',64),
       repeat('6',64),repeat('7',64),repeat('8',64),repeat('9',64),repeat('a',64),repeat('b',64),
       repeat('c',64),repeat('d',64),repeat('e',64),repeat('f',64)))
     or exists (select 1 from public.corralio_sms_request_decisions where destination_hmac in (
       repeat('0',64),repeat('1',64),repeat('2',64),repeat('3',64),repeat('4',64),repeat('5',64),
       repeat('6',64),repeat('7',64),repeat('8',64),repeat('a',64),repeat('b',64),repeat('c',64),
       repeat('e',64),repeat('f',64)))
     or exists (select 1 from public.corralio_sms_phone_send_permits where destination_hmac in (
       repeat('1',64),repeat('2',64),repeat('3',64),repeat('4',64),repeat('5',64),repeat('6',64),
       repeat('7',64),repeat('8',64),repeat('a',64),repeat('b',64),repeat('c',64),repeat('e',64)))
     or exists (select 1 from public.corralio_sms_daily_segment_budgets
       where utc_date = (clock_timestamp() at time zone 'UTC')::date)
     or exists (select 1 from public.corralio_sms_destination_segment_budgets
       where utc_date = (clock_timestamp() at time zone 'UTC')::date)
  then raise exception 'Gate 3 behavioral verification failed: rollback cleanup'; end if;
end
$cleanup$;

select 'DURABLE GATE 3 BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO'
  as corralio_sms_durable_state_behavioral_verification;
