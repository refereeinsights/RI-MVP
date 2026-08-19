-- Corralio Slice 3.2 rollback-only behavioral verification.
-- Run only after manually applying the reviewed Slice 3.2 migration.
-- No external URL is fetched. All synthetic records are rolled back.

begin;

create or replace function pg_temp.corralio_slice32_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if p_condition is not true then
    raise exception 'Corralio Slice 3.2 verification failed: %', p_message;
  end if;
end;
$function$;

insert into public.corralio_households (id, display_name)
values ('ca320000-0000-4000-8000-000000000001', 'Slice 3.2 Synthetic Family');

insert into public.corralio_schedule_sources (
  id, household_id, source_type, display_name, source_url, sync_status,
  last_refresh_attempted_at
)
select
  ('00000000-0000-0000-0000-' || lpad((100 + series)::text, 12, '0'))::uuid,
  'ca320000-0000-4000-8000-000000000001'::uuid,
  'ics',
  'Slice 3.2 Source ' || series,
  'https://slice32.example.invalid/private-' || series || '.ics?token=synthetic-secret-' || series,
  case when series = 14 then 'disconnected' else 'success' end,
  case
    when series <= 12 then null
    when series = 13 then now() - interval '1 hour'
    else now() - interval '48 hours'
  end
from generate_series(1, 14) series;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

create temporary table slice32_claims on commit drop as
select * from public.corralio_claim_ics_refresh_batch_v1(10);

select pg_temp.corralio_slice32_assert((select count(*) = 10 from slice32_claims), 'batch was not capped at 10');
select pg_temp.corralio_slice32_assert(
  (select count(*) = 10 from slice32_claims where household_id = 'ca320000-0000-4000-8000-000000000001'::uuid),
  'first worker claimed a non-synthetic production source'
);
select pg_temp.corralio_slice32_assert(
  exists (select 1 from slice32_claims where source_id = '00000000-0000-0000-0000-000000000101'::uuid),
  'never-attempted source was not prioritized with NULLS FIRST'
);
select pg_temp.corralio_slice32_assert(
  not exists (select 1 from slice32_claims where source_id in (
    '00000000-0000-0000-0000-000000000113'::uuid,
    '00000000-0000-0000-0000-000000000114'::uuid
  )),
  'recent or disconnected source was claimed'
);
create temporary table slice32_second_claims on commit drop as
select * from public.corralio_claim_ics_refresh_batch_v1(2);
select pg_temp.corralio_slice32_assert(
  (select count(*) = 2 from slice32_second_claims),
  'second worker did not claim the remaining synthetic sources'
);
select pg_temp.corralio_slice32_assert(
  (select count(*) = 2 from slice32_second_claims where household_id = 'ca320000-0000-4000-8000-000000000001'::uuid),
  'second worker claimed a non-synthetic production source'
);
select pg_temp.corralio_slice32_assert(
  (select array_agg(source_id order by source_id) from slice32_second_claims) = array[
    '00000000-0000-0000-0000-000000000111'::uuid,
    '00000000-0000-0000-0000-000000000112'::uuid
  ],
  'second worker did not claim the expected remaining synthetic sources'
);
select pg_temp.corralio_slice32_assert(
  not exists (
    select 1
    from slice32_second_claims second_claim
    join slice32_claims first_claim using (source_id)
  ),
  'active source was claimed by two workers'
);

-- An abandoned claim is recoverable after 10 minutes even though its attempt
-- timestamp was just updated by the original claim.
update public.corralio_schedule_sources source
set refresh_claimed_at = now() - interval '11 minutes',
    last_refresh_attempted_at = null
where source.id = '00000000-0000-0000-0000-000000000101'::uuid;

create temporary table slice32_reclaim on commit drop as
select * from public.corralio_claim_ics_refresh_batch_v1(1);
select pg_temp.corralio_slice32_assert(
  (select source_id = '00000000-0000-0000-0000-000000000101'::uuid from slice32_reclaim),
  'expired claim was not recovered'
);

-- Canonical claimed persistence creates the event, marks success, and clears
-- the claim without duplicating ingestion logic.
select *
from public.corralio_persist_claimed_ics_refresh_v1(
  '00000000-0000-0000-0000-000000000101'::uuid,
  (select claim_token from slice32_reclaim),
  '[{"title":"Synthetic Game","starts_at":"2026-08-22T17:00:00Z","ends_at":null,"timezone":null,"source_event_uid":"slice32-game-1","source_location_text":"Synthetic Park","display_location_text":"Synthetic Park","field_label":null,"notes":null}]'::jsonb,
  '{}'::text[]
);
select pg_temp.corralio_slice32_assert(
  exists (
    select 1 from public.corralio_events
    where schedule_source_id = '00000000-0000-0000-0000-000000000101'::uuid
      and source_event_uid = 'slice32-game-1'
  ),
  'claimed persistence did not delegate event upsert'
);
select pg_temp.corralio_slice32_assert(
  exists (
    select 1 from public.corralio_schedule_sources
    where id = '00000000-0000-0000-0000-000000000101'::uuid
      and sync_status = 'success'
      and refresh_claim_token is null
      and last_refresh_error_code is null
  ),
  'successful persistence did not clear claim/status metadata'
);

-- Failure finalization preserves the prior event and source URL while storing
-- only the bounded safe error code.
select public.corralio_fail_claimed_ics_refresh_v1(
  '00000000-0000-0000-0000-000000000102'::uuid,
  (select claim_token from slice32_claims where source_id = '00000000-0000-0000-0000-000000000102'::uuid),
  'fetch_failed'
);
select pg_temp.corralio_slice32_assert(
  exists (
    select 1 from public.corralio_schedule_sources source
    where source.id = '00000000-0000-0000-0000-000000000102'::uuid
      and source.sync_status = 'error'
      and source.last_refresh_error_code = 'fetch_failed'
      and source.refresh_claim_token is null
      and source.source_url like 'https://slice32.example.invalid/%'
  ),
  'failure finalization changed secret URL or failed to clear claim safely'
);

-- Replacing a URL invalidates a stale worker claim before that worker can
-- persist data fetched from the previous secret URL.
update public.corralio_schedule_sources
set source_url = 'https://slice32.example.invalid/replaced.ics?token=new-synthetic-secret'
where id = '00000000-0000-0000-0000-000000000103'::uuid;
select pg_temp.corralio_slice32_assert(
  exists (
    select 1 from public.corralio_schedule_sources
    where id = '00000000-0000-0000-0000-000000000103'::uuid
      and refresh_claim_token is null
      and refresh_claimed_at is null
  ),
  'URL replacement did not invalidate the active refresh claim'
);

rollback;

-- After ROLLBACK, this must return zeroes.
select
  (select count(*) from public.corralio_households where display_name = 'Slice 3.2 Synthetic Family') as households,
  (select count(*) from public.corralio_schedule_sources where display_name like 'Slice 3.2 Source %') as sources,
  (select count(*) from public.corralio_events where source_event_uid = 'slice32-game-1') as events;
