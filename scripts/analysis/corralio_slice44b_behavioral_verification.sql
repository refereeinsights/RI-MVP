-- Rollback-only Slice 4.4B behavioral verifier. No network or provider calls.
begin;

create or replace function pg_temp.corralio_slice44b_assert(p_condition boolean, p_message text)
returns void language plpgsql as $f$
begin
  if p_condition is not true then raise exception '4.4B verification failed: %', p_message; end if;
end;
$f$;

insert into public.corralio_households (id, display_name) values
  ('c44b0000-0000-4000-8000-000000000011', '4.4B A'),
  ('c44b0000-0000-4000-8000-000000000012', '4.4B B');

insert into public.corralio_schedule_sources
  (id, household_id, source_type, display_name, source_url)
values
  ('c44b0000-0000-4000-8000-000000000021', 'c44b0000-0000-4000-8000-000000000011', 'ics', 'A', 'https://fixture.invalid/a'),
  ('c44b0000-0000-4000-8000-000000000022', 'c44b0000-0000-4000-8000-000000000012', 'ics', 'B', 'https://fixture.invalid/b');

insert into public.corralio_events
  (id, household_id, origin_type, schedule_source_id, source_event_uid, title, starts_at,
   source_location_text, location_lat, location_lng, location_normalized, location_geocoded_at)
values
  ('c44b0000-0000-4000-8000-000000000031', 'c44b0000-0000-4000-8000-000000000011', 'ics', 'c44b0000-0000-4000-8000-000000000021', 'a', 'A', now() + interval '1 day', 'Fixture Place A', 47.1, -117.1, 'fixture place a', now()),
  ('c44b0000-0000-4000-8000-000000000032', 'c44b0000-0000-4000-8000-000000000012', 'ics', 'c44b0000-0000-4000-8000-000000000022', 'b', 'B', now() + interval '1 day', 'Fixture Place B', 47.1, -117.1, 'fixture place b', now());

insert into public.corralio_events
  (id, household_id, origin_type, title, starts_at, display_location_text)
values
  ('c44b0000-0000-4000-8000-000000000033', 'c44b0000-0000-4000-8000-000000000011',
   'manual', 'Manual', now() + interval '1 day', 'Fixture Manual Place');

-- The Slice 4.3 trigger correctly clears client/insert-supplied geocodes when
-- location text is first persisted; simulate the trusted completed geocode.
update public.corralio_events
set location_lat = 47.1, location_lng = -117.1, location_geocoded_at = now()
where id in (
  'c44b0000-0000-4000-8000-000000000031',
  'c44b0000-0000-4000-8000-000000000032'
);
update public.corralio_events
set location_lat = 47.1, location_lng = -117.1, location_geocoded_at = now()
where id = 'c44b0000-0000-4000-8000-000000000033';

insert into public.corralio_event_venue_matches
  (event_id, household_id, venue_id, provisional_venue_id, match_status, location_fingerprint,
   matcher_version, evaluated_at, matched_at, recheck_after)
values
  ('c44b0000-0000-4000-8000-000000000031', 'c44b0000-0000-4000-8000-000000000011', null, null, 'unmatched', repeat('a',64), 'corralio-v1', now(), null, now() + interval '30 days'),
  ('c44b0000-0000-4000-8000-000000000032', 'c44b0000-0000-4000-8000-000000000012', null, null, 'unmatched', repeat('b',64), 'corralio-v1', now(), null, now() + interval '30 days');

insert into public.corralio_event_venue_matches
  (event_id, household_id, venue_id, provisional_venue_id, match_status, location_fingerprint,
   matcher_version, evaluated_at, matched_at, recheck_after)
values
  ('c44b0000-0000-4000-8000-000000000033', 'c44b0000-0000-4000-8000-000000000011', null, null,
   'unmatched', repeat('c',64), 'corralio-v1', now(), null, now() + interval '30 days');

select * from public.corralio_create_or_reuse_provisional_venue_v1(
  'c44b0000-0000-4000-8000-000000000011', 'c44b0000-0000-4000-8000-000000000033',
  repeat('3',64), 'Fixture Manual Place', 'fixture manual place', null,
  'fixture city', 'WA', 47.1, -117.1, 'corralio-provisional-v1'
);
select pg_temp.corralio_slice44b_assert(
  not exists (select 1 from public.corralio_provisional_venues where identity_key = repeat('3',64)),
  'manual event created shared identity'
);

select * from public.corralio_create_or_reuse_provisional_venue_v1(
  'c44b0000-0000-4000-8000-000000000011', 'c44b0000-0000-4000-8000-000000000031',
  repeat('1',64), 'Fixture Community Center', 'fixture community center', '1 fixture road',
  'fixture city', 'WA', 47.1, -117.1, 'corralio-provisional-v1'
);
select * from public.corralio_create_or_reuse_provisional_venue_v1(
  'c44b0000-0000-4000-8000-000000000012', 'c44b0000-0000-4000-8000-000000000032',
  repeat('1',64), 'Fixture Community Center', 'fixture community center', '1 fixture road',
  'fixture city', 'WA', 47.1, -117.1, 'corralio-provisional-v1'
);

select pg_temp.corralio_slice44b_assert(
  (select count(*) = 1 from public.corralio_provisional_venues where identity_key = repeat('1',64)),
  'cross-household observations did not converge'
);
select pg_temp.corralio_slice44b_assert(
  (select count(distinct provisional_venue_id) = 1 from public.corralio_event_venue_matches
   where event_id in ('c44b0000-0000-4000-8000-000000000031','c44b0000-0000-4000-8000-000000000032')),
  'associations did not reuse one provisional identity'
);

select public.corralio_suppress_provisional_venue_v1(
  (select id from public.corralio_provisional_venues where identity_key = repeat('1',64))
);
select pg_temp.corralio_slice44b_assert(
  (select lifecycle_status = 'suppressed' from public.corralio_provisional_venues where identity_key = repeat('1',64)),
  'suppression tombstone was not retained'
);
select pg_temp.corralio_slice44b_assert(
  not exists (select 1 from public.corralio_event_venue_matches where provisional_venue_id is not null
    and event_id in ('c44b0000-0000-4000-8000-000000000031','c44b0000-0000-4000-8000-000000000032')),
  'suppression did not detach associations'
);

select * from public.corralio_create_or_reuse_provisional_venue_v1(
  'c44b0000-0000-4000-8000-000000000011', 'c44b0000-0000-4000-8000-000000000031',
  repeat('1',64), 'Fixture Community Center', 'fixture community center', '1 fixture road',
  'fixture city', 'WA', 47.1, -117.1, 'corralio-provisional-v1'
);
select pg_temp.corralio_slice44b_assert(
  (select count(*) = 1 from public.corralio_provisional_venues where identity_key = repeat('1',64)),
  'suppressed identity recreated'
);

set local role authenticated;
do $denied$
begin
  begin
    perform count(*) from public.corralio_provisional_venues;
    raise exception using errcode = 'P0001', message = 'authenticated read unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when insufficient_privilege then null; end;
end;
$denied$;
reset role;

rollback;

do $cleanup$
begin
  if exists (select 1 from public.corralio_households where id in (
    'c44b0000-0000-4000-8000-000000000011','c44b0000-0000-4000-8000-000000000012'
  )) or exists (select 1 from public.corralio_provisional_venues where identity_key = repeat('1',64)) then
    raise exception '4.4B verification failed: rollback cleanup was not zero';
  end if;
end;
$cleanup$;

select 'SLICE 4.4B BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO' as corralio_slice44b_behavioral_verification;
