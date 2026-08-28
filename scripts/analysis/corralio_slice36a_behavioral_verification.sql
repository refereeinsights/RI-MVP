-- Network-free, rollback-only Slice 3.6A database behavioral verification.
begin;

create or replace function pg_temp.corralio_slice36a_assert(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if p_condition is not true then
    raise exception 'Corralio Slice 3.6A verification failed: %', p_message;
  end if;
end;
$function$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'c36a0000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'corralio-slice36a@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.corralio_households (id, display_name)
values ('c36a0000-0000-4000-8000-000000000011', 'Slice 3.6A fixture');
insert into public.corralio_household_members (household_id, user_id, role, status)
values (
  'c36a0000-0000-4000-8000-000000000011',
  'c36a0000-0000-4000-8000-000000000001', 'owner', 'active'
);
insert into public.corralio_events (
  id, household_id, origin_type, title, starts_at, ends_at, timezone
) values (
  'c36a0000-0000-4000-8000-000000000021',
  'c36a0000-0000-4000-8000-000000000011', 'manual', 'Fixture Game',
  '2026-09-05T17:00:00Z', '2026-09-05T18:00:00Z', 'UTC'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select pg_temp.corralio_slice36a_assert(
  public.corralio_upsert_push_subscription_v1(
    'c36a0000-0000-4000-8000-000000000001',
    'c36a0000-0000-4000-8000-000000000011',
    'https://push.example.invalid/slice36a-one', 'FixtureP256dhOne', 'FixtureAuthOne'
  ) = 'subscribed',
  'first subscription was not accepted'
);
select public.corralio_upsert_push_subscription_v1(
  'c36a0000-0000-4000-8000-000000000001',
  'c36a0000-0000-4000-8000-000000000011',
  'https://push.example.invalid/slice36a-one', 'FixtureP256dhOneUpdated', 'FixtureAuthOneUpdated'
);
select public.corralio_upsert_push_subscription_v1(
  'c36a0000-0000-4000-8000-000000000001',
  'c36a0000-0000-4000-8000-000000000011',
  'https://push.example.invalid/slice36a-two', 'FixtureP256dhTwo', 'FixtureAuthTwo'
);
select pg_temp.corralio_slice36a_assert(
  (select count(*) = 2 from public.corralio_push_subscriptions
    where household_id = 'c36a0000-0000-4000-8000-000000000011'),
  'subscription upsert was not idempotent'
);

select public.corralio_record_push_interaction_v1(
  'c36a0000-0000-4000-8000-000000000001',
  'c36a0000-0000-4000-8000-000000000011', 'soft_ask_shown'
);
select public.corralio_record_push_interaction_v1(
  'c36a0000-0000-4000-8000-000000000001',
  'c36a0000-0000-4000-8000-000000000011', 'soft_ask_shown'
);
select pg_temp.corralio_slice36a_assert(
  (select count(*) = 1 from public.corralio_push_interactions
    where household_id = 'c36a0000-0000-4000-8000-000000000011'),
  'interaction minute dedupe failed'
);

create temporary table slice36a_first_claims on commit drop as
select * from public.corralio_claim_weekend_ready_deliveries_v1(
  '2026-09-04',
  '2026-09-04T05:00:00Z', '2026-09-07T05:00:00Z', 50
);
select pg_temp.corralio_slice36a_assert(
  (select count(*) = 2 from slice36a_first_claims),
  'two subscriptions did not produce two delivery claims'
);
select pg_temp.corralio_slice36a_assert(
  (select count(*) = 1 from public.corralio_weekend_ready_campaigns
    where household_id = 'c36a0000-0000-4000-8000-000000000011'),
  'household/weekend campaign was not singular'
);

select pg_temp.corralio_slice36a_assert(
  public.corralio_finish_weekend_ready_delivery_v1(
    (select delivery_id from slice36a_first_claims order by delivery_id limit 1),
    (select claim_token from slice36a_first_claims order by delivery_id limit 1),
    'accepted', null
  ), 'accepted delivery did not finalize'
);
select pg_temp.corralio_slice36a_assert(
  public.corralio_finish_weekend_ready_delivery_v1(
    (select delivery_id from slice36a_first_claims order by delivery_id offset 1 limit 1),
    (select claim_token from slice36a_first_claims order by delivery_id offset 1 limit 1),
    'transient_failure', 'provider_error'
  ), 'transient delivery did not finalize'
);

create temporary table slice36a_immediate_retry on commit drop as
select * from public.corralio_claim_weekend_ready_deliveries_v1(
  '2026-09-04',
  '2026-09-04T05:00:00Z', '2026-09-07T05:00:00Z', 50
);
select pg_temp.corralio_slice36a_assert(
  (select count(*) = 0 from slice36a_immediate_retry),
  'accepted or cooldown delivery was reclaimed'
);

update public.corralio_weekend_ready_deliveries
set next_attempt_at = now() - interval '1 minute'
where state = 'transient_failure';
create temporary table slice36a_retry_claim on commit drop as
select * from public.corralio_claim_weekend_ready_deliveries_v1(
  '2026-09-04',
  '2026-09-04T05:00:00Z', '2026-09-07T05:00:00Z', 50
);
select pg_temp.corralio_slice36a_assert(
  (select count(*) = 1 and max(attempt_count) = 2 from slice36a_retry_claim),
  'bounded second attempt was not claimed exactly once'
);
select public.corralio_finish_weekend_ready_delivery_v1(
  (select delivery_id from slice36a_retry_claim),
  (select claim_token from slice36a_retry_claim),
  'transient_failure', 'provider_error'
);
select pg_temp.corralio_slice36a_assert(
  (select count(*) = 1 from public.corralio_weekend_ready_deliveries
    where state = 'accepted' and attempt_count = 1),
  'accepted delivery state changed'
);
select pg_temp.corralio_slice36a_assert(
  (select count(*) = 1 from public.corralio_weekend_ready_deliveries
    where state = 'permanent_failure' and attempt_count = 2 and error_code = 'retry_exhausted'),
  'retry exhaustion did not become terminal'
);

delete from public.corralio_household_members
where household_id = 'c36a0000-0000-4000-8000-000000000011'
  and user_id = 'c36a0000-0000-4000-8000-000000000001';
select pg_temp.corralio_slice36a_assert(
  (select count(*) = 0 from public.corralio_push_subscriptions
    where household_id = 'c36a0000-0000-4000-8000-000000000011' and state = 'active'),
  'membership loss did not deactivate subscriptions'
);

reset role;
rollback;

do $cleanup$
begin
  if exists (select 1 from public.corralio_households
      where id = 'c36a0000-0000-4000-8000-000000000011')
     or exists (select 1 from auth.users
      where id = 'c36a0000-0000-4000-8000-000000000001')
     or exists (select 1 from public.corralio_push_subscriptions
      where household_id = 'c36a0000-0000-4000-8000-000000000011')
  then raise exception 'Slice 3.6A behavioral verification failed: rollback cleanup'; end if;
end
$cleanup$;

select 'SLICE 3.6A BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO'
  as corralio_slice36a_behavioral_verification;
