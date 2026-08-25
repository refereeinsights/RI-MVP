-- Rollback-only Corralio Slice 4.4C behavioral verifier. No provider/network calls.
begin;

create or replace function pg_temp.corralio_slice44c_assert(p_condition boolean, p_message text)
returns void language plpgsql as $f$
begin
  if p_condition is not true then raise exception '4.4C verification failed: %', p_message; end if;
end;
$f$;

insert into public.corralio_households (id, display_name) values
  ('c44c0000-0000-4000-8000-000000000011', '4.4C A'),
  ('c44c0000-0000-4000-8000-000000000012', '4.4C B');

insert into public.corralio_schedule_sources
  (id, household_id, source_type, display_name, source_url)
values
  ('c44c0000-0000-4000-8000-000000000021', 'c44c0000-0000-4000-8000-000000000011', 'ics', 'A', 'https://fixture.invalid/a'),
  ('c44c0000-0000-4000-8000-000000000022', 'c44c0000-0000-4000-8000-000000000012', 'ics', 'B', 'https://fixture.invalid/b');

insert into public.corralio_events
  (id, household_id, origin_type, schedule_source_id, source_event_uid, title,
   starts_at, source_location_text)
values
  ('c44c0000-0000-4000-8000-000000000031', 'c44c0000-0000-4000-8000-000000000011', 'ics', 'c44c0000-0000-4000-8000-000000000021', 'a1', 'A1', now() + interval '1 day', 'Fixture Evidence Center, 1 Fixture Road, Fixture City, WA'),
  ('c44c0000-0000-4000-8000-000000000032', 'c44c0000-0000-4000-8000-000000000011', 'ics', 'c44c0000-0000-4000-8000-000000000021', 'a2', 'A2', now() + interval '1 day', 'Fixture Evidence Center, 1 Fixture Road, Fixture City, WA'),
  ('c44c0000-0000-4000-8000-000000000033', 'c44c0000-0000-4000-8000-000000000011', 'ics', 'c44c0000-0000-4000-8000-000000000021', 'a3', 'A3', now() + interval '1 day', 'Fixture Evidence Center, 1 Fixture Road, Fixture City, WA'),
  ('c44c0000-0000-4000-8000-000000000034', 'c44c0000-0000-4000-8000-000000000012', 'ics', 'c44c0000-0000-4000-8000-000000000022', 'b1', 'B1', now() + interval '1 day', 'Fixture Evidence Center, 1 Fixture Road, Fixture City, WA');

-- Slice 4.3 correctly clears insert-supplied coordinates; simulate completed trusted geocodes.
update public.corralio_events
set location_lat = 47.2, location_lng = -117.2, location_geocoded_at = now()
where id in (
  'c44c0000-0000-4000-8000-000000000031',
  'c44c0000-0000-4000-8000-000000000032',
  'c44c0000-0000-4000-8000-000000000033',
  'c44c0000-0000-4000-8000-000000000034'
);

insert into public.corralio_event_venue_matches
  (event_id, household_id, venue_id, provisional_venue_id, match_status,
   location_fingerprint, matcher_version, evaluated_at, matched_at, recheck_after)
select id, household_id, null, null, 'unmatched', repeat(substr(source_event_uid, 1, 1), 64),
  'corralio-v1', now(), null, now() + interval '30 days'
from public.corralio_events
where id in (
  'c44c0000-0000-4000-8000-000000000031',
  'c44c0000-0000-4000-8000-000000000032',
  'c44c0000-0000-4000-8000-000000000033',
  'c44c0000-0000-4000-8000-000000000034'
);

select * from public.corralio_create_or_reuse_provisional_venue_v2(
  'c44c0000-0000-4000-8000-000000000011', 'c44c0000-0000-4000-8000-000000000031',
  repeat('1',64), 'Fixture Evidence Center', 'fixture evidence center', '1 fixture road',
  'fixture city', 'WA', 47.2, -117.2, 'corralio-provisional-v1',
  repeat('a',64), repeat('9',64), 'corralio-evidence-hmac-v1'
);
select * from public.corralio_create_or_reuse_provisional_venue_v2(
  'c44c0000-0000-4000-8000-000000000011', 'c44c0000-0000-4000-8000-000000000032',
  repeat('1',64), 'Fixture Evidence Center', 'fixture evidence center', '1 fixture road',
  'fixture city', 'WA', 47.2, -117.2, 'corralio-provisional-v1',
  repeat('a',64), repeat('9',64), 'corralio-evidence-hmac-v1'
);
select * from public.corralio_create_or_reuse_provisional_venue_v2(
  'c44c0000-0000-4000-8000-000000000011', 'c44c0000-0000-4000-8000-000000000033',
  repeat('1',64), 'Fixture Evidence Center', 'fixture evidence center', '1 fixture road',
  'fixture city', 'WA', 47.2, -117.2, 'corralio-provisional-v1',
  repeat('b',64), repeat('9',64), 'corralio-evidence-hmac-v1'
);
select * from public.corralio_create_or_reuse_provisional_venue_v2(
  'c44c0000-0000-4000-8000-000000000012', 'c44c0000-0000-4000-8000-000000000034',
  repeat('1',64), 'Fixture Evidence Center', 'fixture evidence center', '1 fixture road',
  'fixture city', 'WA', 47.2, -117.2, 'corralio-provisional-v1',
  repeat('c',64), repeat('8',64), 'corralio-evidence-hmac-v1'
);

select pg_temp.corralio_slice44c_assert(
  (select count(*) = 3 from public.corralio_provisional_venue_evidence
   where provisional_venue_id = (select id from public.corralio_provisional_venues where identity_key = repeat('1',64))),
  'observation idempotency failed'
);
select pg_temp.corralio_slice44c_assert(
  (select count(distinct source_scope_fingerprint) = 2
   from public.corralio_provisional_venue_evidence
   where provisional_venue_id = (select id from public.corralio_provisional_venues where identity_key = repeat('1',64))),
  'distinct source-scope count failed'
);
select pg_temp.corralio_slice44c_assert(
  not public.corralio_provisional_venue_promotion_eligible_v1(
    (select id from public.corralio_provisional_venues where identity_key = repeat('1',64))
  ),
  'generic ICS evidence became promotion eligible'
);

do $invalid_evidence$
begin
  begin
    insert into public.corralio_provisional_venue_evidence (
      provisional_venue_id, evidence_type, observation_fingerprint,
      source_scope_fingerprint, fingerprint_version, normalizer_version, observed_at
    ) values (
      (select id from public.corralio_provisional_venues where identity_key = repeat('1',64)),
      'overture_place_match', repeat('d',64), repeat('7',64),
      'corralio-evidence-hmac-v1', 'corralio-provisional-v1', now()
    );
    raise exception using errcode = 'P0001', message = 'unsupported evidence unexpectedly persisted';
  exception when sqlstate 'P0001' then raise; when check_violation then null; end;
end;
$invalid_evidence$;

-- Direct owner fixtures allow merge/suppression/reconciliation behavior to be
-- tested without weakening the runtime table grants.
insert into public.corralio_provisional_venues
  (id, identity_key, place_name, normalized_place_name, normalized_address,
   city, state, latitude, longitude, normalizer_version)
values
  ('c44c0000-0000-4000-8000-000000000041', repeat('2',64), 'Fixture Duplicate', 'fixture duplicate', '2 fixture road', 'fixture city', 'WA', 47.3, -117.3, 'corralio-provisional-v1'),
  ('c44c0000-0000-4000-8000-000000000042', repeat('3',64), 'Fixture Duplicate', 'fixture duplicate', '2 fixture road', 'fixture city', 'WA', 47.3, -117.3, 'corralio-provisional-v1'),
  ('c44c0000-0000-4000-8000-000000000043', repeat('4',64), 'Fixture Suppress', 'fixture suppress', '4 fixture road', 'fixture city', 'WA', 47.4, -117.4, 'corralio-provisional-v1');

insert into public.corralio_provisional_venue_evidence
  (provisional_venue_id, evidence_type, observation_fingerprint,
   source_scope_fingerprint, fingerprint_version, normalizer_version, observed_at)
values
  ('c44c0000-0000-4000-8000-000000000041', 'ics_observation', repeat('2',64), repeat('6',64), 'corralio-evidence-hmac-v1', 'corralio-provisional-v1', now()),
  ('c44c0000-0000-4000-8000-000000000043', 'ics_observation', repeat('4',64), repeat('5',64), 'corralio-evidence-hmac-v1', 'corralio-provisional-v1', now());

update public.corralio_event_venue_matches
set provisional_venue_id = 'c44c0000-0000-4000-8000-000000000041'
where event_id = 'c44c0000-0000-4000-8000-000000000031';

select pg_temp.corralio_slice44c_assert(
  public.corralio_merge_provisional_venue_exact_v1(
    'c44c0000-0000-4000-8000-000000000041', 'c44c0000-0000-4000-8000-000000000042'
  ), 'exact merge rejected'
);
select pg_temp.corralio_slice44c_assert(
  public.corralio_merge_provisional_venue_exact_v1(
    'c44c0000-0000-4000-8000-000000000041', 'c44c0000-0000-4000-8000-000000000042'
  ), 'repeated merge was not idempotent'
);
select pg_temp.corralio_slice44c_assert(
  (select lifecycle_status = 'merged' and merged_into_provisional_id = 'c44c0000-0000-4000-8000-000000000042'
   from public.corralio_provisional_venues where id = 'c44c0000-0000-4000-8000-000000000041'),
  'merge state/target incoherent'
);
select pg_temp.corralio_slice44c_assert(
  exists (select 1 from public.corralio_provisional_venue_evidence where provisional_venue_id = 'c44c0000-0000-4000-8000-000000000041'),
  'merge destroyed original evidence'
);
select pg_temp.corralio_slice44c_assert(
  (select count(*) = 1 from public.corralio_provisional_venue_transitions
   where provisional_venue_id = 'c44c0000-0000-4000-8000-000000000041' and transition_type = 'merge'),
  'merge transition missing or duplicated'
);
select pg_temp.corralio_slice44c_assert(
  (select provisional_venue_id = 'c44c0000-0000-4000-8000-000000000042'
   from public.corralio_event_venue_matches where event_id = 'c44c0000-0000-4000-8000-000000000031'),
  'merge did not repoint current association'
);
select pg_temp.corralio_slice44c_assert(
  not public.corralio_merge_provisional_venue_trusted_v1(
    'c44c0000-0000-4000-8000-000000000042', 'c44c0000-0000-4000-8000-000000000043', 'free text'
  ), 'free-text merge reason accepted'
);
select pg_temp.corralio_slice44c_assert(
  public.corralio_merge_provisional_venue_trusted_v1(
    'c44c0000-0000-4000-8000-000000000042', 'c44c0000-0000-4000-8000-000000000043', 'trusted_manual_duplicate'
  ), 'trusted enumerated merge rejected'
);
select pg_temp.corralio_slice44c_assert(
  (select merged_into_provisional_id = 'c44c0000-0000-4000-8000-000000000043'
   from public.corralio_provisional_venues where id = 'c44c0000-0000-4000-8000-000000000041'),
  'one-hop redirect was not flattened to final survivor'
);

create or replace function pg_temp.corralio_slice44c_fail_transition()
returns trigger language plpgsql as $f$
begin
  raise exception using errcode = 'C4401', message = 'synthetic transition failure';
end;
$f$;
create trigger corralio_slice44c_fail_transition
before insert on public.corralio_provisional_venue_transitions
for each row execute function pg_temp.corralio_slice44c_fail_transition();

do $atomic$
begin
  begin
    perform public.corralio_suppress_provisional_venue_v2(
      'c44c0000-0000-4000-8000-000000000043', 'trusted_suppression'
    );
    raise exception using errcode = 'P0001', message = 'forced audit failure did not abort transition';
  exception when sqlstate 'P0001' then raise; when sqlstate 'C4401' then null; end;
end;
$atomic$;
select pg_temp.corralio_slice44c_assert(
  (select lifecycle_status = 'active' from public.corralio_provisional_venues where id = 'c44c0000-0000-4000-8000-000000000043'),
  'lifecycle state committed without transition'
);
drop trigger corralio_slice44c_fail_transition on public.corralio_provisional_venue_transitions;

update public.corralio_event_venue_matches
set provisional_venue_id = 'c44c0000-0000-4000-8000-000000000043'
where event_id = 'c44c0000-0000-4000-8000-000000000032';

select pg_temp.corralio_slice44c_assert(
  public.corralio_suppress_provisional_venue_v2(
    'c44c0000-0000-4000-8000-000000000043', 'trusted_suppression'
  ), 'suppression failed'
);
select pg_temp.corralio_slice44c_assert(
  (select lifecycle_status = 'suppressed' from public.corralio_provisional_venues where id = 'c44c0000-0000-4000-8000-000000000043'),
  'suppression state failed'
);
select pg_temp.corralio_slice44c_assert(
  (select count(*) = 1 from public.corralio_provisional_venue_transitions
   where provisional_venue_id = 'c44c0000-0000-4000-8000-000000000043' and transition_type = 'suppression'),
  'suppression transition missing'
);
select pg_temp.corralio_slice44c_assert(
  (select match_status = 'unmatched' and provisional_venue_id is null and venue_id is null
   from public.corralio_event_venue_matches where event_id = 'c44c0000-0000-4000-8000-000000000032'),
  'suppression did not detach current association'
);

create temp table corralio_slice44c_canonical_candidate on commit drop as
select id, public.identity_normalize_text(name) as normalized_name,
  public.identity_normalize_text(address) as normalized_address,
  public.identity_normalize_text(city) as normalized_city,
  upper(btrim(state)) as state
from public.venues_public
where public.identity_normalize_text(name) is not null
  and public.identity_normalize_text(city) is not null
  and length(public.identity_normalize_text(name)) between 2 and 200
  and length(public.identity_normalize_text(city)) between 1 and 100
  and (
    public.identity_normalize_text(address) is null
    or length(public.identity_normalize_text(address)) between 3 and 240
  )
  and upper(btrim(state)) ~ '^[A-Z]{2}$'
order by id
limit 1;
select pg_temp.corralio_slice44c_assert(
  (select count(*) = 1 from corralio_slice44c_canonical_candidate),
  'no safe existing canonical candidate available'
);

insert into public.corralio_provisional_venues
  (id, identity_key, place_name, normalized_place_name, normalized_address,
   city, state, latitude, longitude, normalizer_version)
select 'c44c0000-0000-4000-8000-000000000044', repeat('5',64),
  'Canonical Reconciliation Fixture', normalized_name, normalized_address,
  normalized_city, state, 47.5, -117.5, 'corralio-provisional-v1'
from corralio_slice44c_canonical_candidate;

update public.corralio_event_venue_matches
set provisional_venue_id = 'c44c0000-0000-4000-8000-000000000044'
where event_id = 'c44c0000-0000-4000-8000-000000000033';

select pg_temp.corralio_slice44c_assert(
  public.corralio_reconcile_provisional_venue_v1(
    'c44c0000-0000-4000-8000-000000000044',
    (select id from corralio_slice44c_canonical_candidate)
  ), 'canonical reconciliation failed'
);
select pg_temp.corralio_slice44c_assert(
  (select lifecycle_status = 'reconciled'
      and canonical_venue_id = (select id from corralio_slice44c_canonical_candidate)
   from public.corralio_provisional_venues where id = 'c44c0000-0000-4000-8000-000000000044'),
  'reconciliation state/target incoherent'
);
select pg_temp.corralio_slice44c_assert(
  (select count(*) = 1 from public.corralio_provisional_venue_transitions
   where provisional_venue_id = 'c44c0000-0000-4000-8000-000000000044' and transition_type = 'reconciliation'),
  'reconciliation transition missing'
);
select pg_temp.corralio_slice44c_assert(
  (select match_status = 'matched'
      and provisional_venue_id is null
      and venue_id = (select id from corralio_slice44c_canonical_candidate)
   from public.corralio_event_venue_matches where event_id = 'c44c0000-0000-4000-8000-000000000033'),
  'reconciliation did not atomically replace provisional association'
);
select pg_temp.corralio_slice44c_assert(
  (select location_lat = 47.2 and location_lng = -117.2
   from public.corralio_events where id = 'c44c0000-0000-4000-8000-000000000033'),
  'reconciliation changed event geocode'
);

delete from public.corralio_schedule_sources
where id = 'c44c0000-0000-4000-8000-000000000021';
select pg_temp.corralio_slice44c_assert(
  (select count(*) = 3 from public.corralio_provisional_venue_evidence
   where provisional_venue_id = (select id from public.corralio_provisional_venues where identity_key = repeat('1',64))),
  'source deletion erased anonymized evidence history'
);

set local role authenticated;
do $denied$
begin
  begin
    perform count(*) from public.corralio_provisional_venue_evidence;
    raise exception using errcode = 'P0001', message = 'authenticated evidence read unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when insufficient_privilege then null; end;
  begin
    perform public.corralio_suppress_provisional_venue_v2(
      'c44c0000-0000-4000-8000-000000000043', 'trusted_suppression'
    );
    raise exception using errcode = 'P0001', message = 'authenticated lifecycle RPC unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when insufficient_privilege then null; end;
end;
$denied$;
reset role;

set local role service_role;
do $append_only$
begin
  begin
    update public.corralio_provisional_venue_transitions set reason_code = 'free text';
    raise exception using errcode = 'P0001', message = 'service transition mutation unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when insufficient_privilege then null; end;
  begin
    insert into public.corralio_provisional_venue_evidence (
      provisional_venue_id, evidence_type, observation_fingerprint,
      source_scope_fingerprint, fingerprint_version, normalizer_version, observed_at
    ) values (
      'c44c0000-0000-4000-8000-000000000042', 'ics_observation',
      repeat('e',64), repeat('f',64), 'corralio-evidence-hmac-v1',
      'corralio-provisional-v1', now()
    );
    raise exception using errcode = 'P0001', message = 'service direct evidence insert unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when insufficient_privilege then null; end;
end;
$append_only$;
reset role;

rollback;

do $cleanup$
begin
  if exists (select 1 from public.corralio_households where id in (
    'c44c0000-0000-4000-8000-000000000011', 'c44c0000-0000-4000-8000-000000000012'
  )) or exists (
    select 1 from public.corralio_provisional_venues
    where identity_key in (repeat('1',64), repeat('2',64), repeat('3',64), repeat('4',64), repeat('5',64))
  ) or exists (
    select 1 from public.corralio_provisional_venue_evidence
    where observation_fingerprint in (repeat('a',64), repeat('b',64), repeat('c',64), repeat('2',64), repeat('4',64))
  ) then raise exception '4.4C verification failed: rollback cleanup was not zero'; end if;
end;
$cleanup$;

select 'SLICE 4.4C BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO' as corralio_slice44c_behavioral_verification;
