-- Corralio Slice 4.3 rollback-only behavioral verification.
-- Run only in Stage 2 after the migration is manually applied. This script
-- makes no Geocodio, OpenRouteService, DNS, HTTP, or other outbound request.

begin;

create or replace function pg_temp.corralio_slice43_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $function$
begin
  if p_condition is not true then
    raise exception 'Corralio Slice 4.3 verification failed: %', p_message;
  end if;
end;
$function$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'c4300000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'corralio-slice43@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.corralio_households (id, display_name)
values ('c4300000-0000-4000-8000-000000000011', 'Slice 4.3 Household');
insert into public.corralio_household_members (household_id, user_id, role, status)
values (
  'c4300000-0000-4000-8000-000000000011',
  'c4300000-0000-4000-8000-000000000001',
  'owner',
  'active'
);
insert into public.corralio_events (
  id, household_id, origin_type, title, starts_at, display_location_text
) values (
  'c4300000-0000-4000-8000-000000000021',
  'c4300000-0000-4000-8000-000000000011',
  'manual',
  'Slice 4.3 Event',
  now() + interval '3 days',
  '  Public   Landmark  '
);

select pg_temp.corralio_slice43_assert(
  (select location_normalized = 'public landmark'
   from public.corralio_events
   where id = 'c4300000-0000-4000-8000-000000000021'),
  'location trigger did not normalize the raw event location'
);
select pg_temp.corralio_slice43_assert(
  (select num_nonnulls(
      origin_address, origin_lat, origin_lng, origin_geocoded_at,
      origin_geocode_failed_at, origin_geocode_claimed_at
    ) = 0
   from public.corralio_households
   where id = 'c4300000-0000-4000-8000-000000000011'),
  'new household origin fields were not safe null defaults'
);

update public.corralio_events
set location_lat = 47.5,
    location_lng = -122.2,
    location_geocoded_at = now() - interval '2 hours',
    estimated_drive_minutes = 52,
    route_distance_meters = 42124,
    route_provider = 'openrouteservice',
    leave_by_computed_at = now() - interval '1 hour'
where id = 'c4300000-0000-4000-8000-000000000021';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c4300000-0000-4000-8000-000000000001', true);
select public.corralio_prepare_household_origin_v1('Public Origin, Seattle, WA');
reset role;

select pg_temp.corralio_slice43_assert(
  (select origin_address = 'Public Origin, Seattle, WA'
      and origin_geocode_claimed_at is null
   from public.corralio_households
   where id = 'c4300000-0000-4000-8000-000000000011'),
  'authenticated origin preparation did not target the exact owner household'
);
select pg_temp.corralio_slice43_assert(
  (select location_geocoded_at is not null
      and estimated_drive_minutes is null
      and route_distance_meters is null
      and route_provider is null
      and route_failed_at is null
      and route_claimed_at is null
      and leave_by_computed_at is null
   from public.corralio_events
   where id = 'c4300000-0000-4000-8000-000000000021'),
  'origin replacement did not preserve destination geocode and clear all route state'
);

with first_claim as (
  update public.corralio_households
  set origin_geocode_claimed_at = now()
  where id = 'c4300000-0000-4000-8000-000000000011'
    and origin_geocode_claimed_at is null
  returning id
)
select pg_temp.corralio_slice43_assert(
  (select count(*) = 1 from first_claim),
  'first origin concurrency claim did not acquire the row'
);
with losing_claim as (
  update public.corralio_households
  set origin_geocode_claimed_at = now()
  where id = 'c4300000-0000-4000-8000-000000000011'
    and origin_geocode_claimed_at is null
  returning id
)
select pg_temp.corralio_slice43_assert(
  (select count(*) = 0 from losing_claim),
  'second origin concurrency claim unexpectedly acquired the same row'
);

select pg_temp.corralio_slice43_assert(
  public.corralio_reserve_external_call_v1(
    'c4300000-0000-4000-8000-000000000011', 2
  ),
  'first quota reservation failed'
);
select pg_temp.corralio_slice43_assert(
  public.corralio_reserve_external_call_v1(
    'c4300000-0000-4000-8000-000000000011', 2
  ),
  'second quota reservation failed'
);
select pg_temp.corralio_slice43_assert(
  not public.corralio_reserve_external_call_v1(
    'c4300000-0000-4000-8000-000000000011', 2
  ),
  'quota reservation exceeded its cap'
);
select pg_temp.corralio_slice43_assert(
  (select reserved_count = 2
   from public.corralio_external_call_daily_quota
   where household_id = 'c4300000-0000-4000-8000-000000000011'
     and quota_date = (timezone('utc', now()))::date),
  'quota count did not stop exactly at the cap'
);

insert into public.corralio_external_api_calls (
  household_id, api, operation, status, error_code, retryable, billable, latency_ms
) values
  ('c4300000-0000-4000-8000-000000000011', 'geocodio', 'geocode_event',
   'ok', null, null, true, 25),
  ('c4300000-0000-4000-8000-000000000011', 'openrouteservice', 'route_event',
   'skipped', 'daily_cap_reached', null, false, null);

do $test$
begin
  begin
    insert into public.corralio_external_api_calls (
      household_id, api, operation, status, error_code, retryable, billable
    ) values (
      'c4300000-0000-4000-8000-000000000011', 'geocodio', 'geocode_event',
      'skipped', 'daily_cap_reached', true, false
    );
    raise exception using errcode = 'P0001', message = 'invalid audit state unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when check_violation then null; end;

  begin
    update public.corralio_events
      set location_lat = 91, location_lng = 0
    where id = 'c4300000-0000-4000-8000-000000000021';
    raise exception using errcode = 'P0001', message = 'out-of-range latitude unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when check_violation then null; end;

  begin
    update public.corralio_events
      set estimated_drive_minutes = 20
    where id = 'c4300000-0000-4000-8000-000000000021';
    raise exception using errcode = 'P0001', message = 'partial route success unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when check_violation then null; end;
end;
$test$;

select pg_temp.corralio_slice43_assert(
  (select count(*) = 1
   from public.corralio_households
   where id = 'c4300000-0000-4000-8000-000000000011'),
  'fixture escaped its one reserved household'
);
select pg_temp.corralio_slice43_assert(
  (select count(*) = 1
   from public.corralio_events
   where id = 'c4300000-0000-4000-8000-000000000021'
     and household_id = 'c4300000-0000-4000-8000-000000000011'),
  'fixture event changed identity or household'
);

rollback;

-- Expected final command: ROLLBACK. No external request is present anywhere in
-- this script, and the fixed IDs ensure no pre-existing household is targeted.
