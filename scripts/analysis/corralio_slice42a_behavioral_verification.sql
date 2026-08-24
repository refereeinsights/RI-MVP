-- Corralio Slice 4.2A rollback-only behavioral verification.
-- Run only in Stage 2, after both migrations are manually applied. All fixture
-- rows use reserved IDs and inert .invalid strings and the transaction rolls
-- back. No source URL is passed to ingestion, DNS, or HTTP.

begin;

create or replace function pg_temp.corralio_slice42a_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $function$
begin
  if p_condition is not true then
    raise exception 'Corralio Slice 4.2A verification failed: %', p_message;
  end if;
end;
$function$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'c42a0000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'corralio-slice42a-a@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c42a0000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'corralio-slice42a-b@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c42a0000-0000-4000-8000-000000000001', true);
select set_config(
  'corralio.verification.household_a',
  public.corralio_ensure_owner_household('Slice 4.2A Household A', 'invalid-value')::text,
  true
);
-- The early return must never rewrite the first creation's direct provenance.
select public.corralio_ensure_owner_household(null, 'ti_weekend_planner_opt_in');
select set_config('request.jwt.claim.sub', 'c42a0000-0000-4000-8000-000000000002', true);
select set_config(
  'corralio.verification.household_b',
  public.corralio_ensure_owner_household(
    'Slice 4.2A Household B',
    'ti_weekend_planner_opt_in'
  )::text,
  true
);
-- Zero-active-source calls are always safe no-ops.
select public.corralio_record_weekly_engagement_v1(false, 0, false);
reset role;

select pg_temp.corralio_slice42a_assert(
  (select acquisition_provenance = 'direct'
   from public.corralio_households
   where id = current_setting('corralio.verification.household_a')::uuid),
  'invalid provenance was not normalized to direct or was later rewritten'
);
select pg_temp.corralio_slice42a_assert(
  (select acquisition_provenance = 'ti_weekend_planner_opt_in'
   from public.corralio_households
   where id = current_setting('corralio.verification.household_b')::uuid),
  'invited household provenance was not set on insert'
);
select pg_temp.corralio_slice42a_assert(
  (select count(*) = 0
   from public.corralio_weekly_engagement
   where household_id = current_setting('corralio.verification.household_b')::uuid),
  'zero-active-source RPC call wrote engagement'
);

do $test$
begin
  begin
    update public.corralio_households
      set acquisition_provenance = 'direct'
    where id = current_setting('corralio.verification.household_b')::uuid;
    raise exception using errcode = 'P0001', message = 'immutable provenance update unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when check_violation then null; end;
end;
$test$;

insert into public.corralio_schedule_sources (
  id, household_id, source_type, display_name, source_url, sport, sync_status
)
values (
  'c42a0000-0000-4000-8000-000000000011',
  current_setting('corralio.verification.household_a')::uuid,
  'ics', 'Slice 4.2A Active Source',
  'https://slice42a.example.invalid/synthetic.ics', 'soccer', 'success'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c42a0000-0000-4000-8000-000000000001', true);

-- Every explicit validation branch must raise its documented SQLSTATE.
do $test$
begin
  begin
    perform public.corralio_record_weekly_engagement_v1(false, 0, null);
    raise exception using errcode = 'P0001', message = 'null availability unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when sqlstate '22004' then null; end;
  begin
    perform public.corralio_record_weekly_engagement_v1(null, 0, false);
    raise exception using errcode = 'P0001', message = 'null outcome unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when sqlstate '22004' then null; end;
  begin
    perform public.corralio_record_weekly_engagement_v1(false, null, false);
    raise exception using errcode = 'P0001', message = 'null count unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when sqlstate '22004' then null; end;
  begin
    perform public.corralio_record_weekly_engagement_v1(false, -1, false);
    raise exception using errcode = 'P0001', message = 'negative count unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when sqlstate '22023' then null; end;
  begin
    perform public.corralio_record_weekly_engagement_v1(true, 0, false);
    raise exception using errcode = 'P0001', message = 'true/zero unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when sqlstate '22023' then null; end;
  begin
    perform public.corralio_record_weekly_engagement_v1(false, 1, false);
    raise exception using errcode = 'P0001', message = 'false/positive unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when sqlstate '22023' then null; end;
end;
$test$;

-- Unavailable ignores the other two inputs. Later verified views accumulate,
-- preserving both availability history and the week's maximum conflict count.
select public.corralio_record_weekly_engagement_v1(true, -99, true);
select set_config(
  'corralio.verification.first_viewed_at',
  (select first_viewed_at::text
   from public.corralio_weekly_engagement
   where household_id = current_setting('corralio.verification.household_a')::uuid),
  true
);
select public.corralio_record_weekly_engagement_v1(false, 0, false);
select public.corralio_record_weekly_engagement_v1(true, 2, false);
select public.corralio_record_weekly_engagement_v1(true, 1, false);
reset role;

select pg_temp.corralio_slice42a_assert(
  (select count(*) = 1
     and bool_and(had_conflict is true)
     and bool_and(max_conflict_count = 2)
     and bool_and(conflict_check_unavailable is true)
     and bool_and(first_viewed_at::text = current_setting('corralio.verification.first_viewed_at'))
     and bool_and(last_viewed_at >= first_viewed_at)
   from public.corralio_weekly_engagement
   where household_id = current_setting('corralio.verification.household_a')::uuid),
  'same-week upsert did not preserve first view or mixed accumulation semantics'
);
select pg_temp.corralio_slice42a_assert(
  (select usage_week_start = date_trunc('week', timezone('utc', now()))::date
   from public.corralio_weekly_engagement
   where household_id = current_setting('corralio.verification.household_a')::uuid),
  'usage week is not the server-computed UTC ISO Monday'
);
select pg_temp.corralio_slice42a_assert(
  (select count(*) = 2 from public.corralio_households
   where id in (
     current_setting('corralio.verification.household_a')::uuid,
     current_setting('corralio.verification.household_b')::uuid
   )),
  'fixture escaped its two reserved households'
);
select pg_temp.corralio_slice42a_assert(
  (select count(*) = 1 from public.corralio_schedule_sources
   where id = 'c42a0000-0000-4000-8000-000000000011'
     and household_id = current_setting('corralio.verification.household_a')::uuid),
  'fixture source changed or a pre-existing source was targeted'
);

rollback;

-- Expected final command: ROLLBACK. The fixed fixture IDs and transaction scope
-- ensure no pre-existing household, source, event, or weekly row is mutated.
