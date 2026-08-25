-- Network-free, rollback-only Slice 4.5 behavioral verification.
begin;

insert into public.corralio_provisional_venues (
  id, identity_key, place_name, normalized_place_name, normalized_address,
  city, state, latitude, longitude, normalizer_version
) values (
  'c4500000-0000-4000-8000-000000000001',
  repeat('4',64), 'Slice 45 Fixture Sports', 'slice 45 fixture sports',
  '450 fixture way', 'fixture city', 'WA', 47.5, -122.2,
  'corralio-provisional-v1'
);

do $test$
declare
  v_evidence uuid;
  v_second_evidence uuid;
  v_refresh uuid;
  v_failed uuid;
begin
  v_evidence := public.corralio_record_overture_place_match_v1(
    'c4500000-0000-4000-8000-000000000001', repeat('5',64), repeat('6',64),
    'overture-fixture-place', false, null, 'fixture-release', 1,
    'sports_complex', 0.9, 'corralio-overture-match-v1', 'matched', now(),
    array['meta'], array['names'], array['CDLA-Permissive-2.0'],
    array['fixture-record'], array[null::timestamptz]
  );
  if v_evidence is null then raise exception 'evidence writer rejected valid match'; end if;
  v_second_evidence := public.corralio_record_overture_place_match_v1(
    'c4500000-0000-4000-8000-000000000001', repeat('5',64), repeat('6',64),
    'overture-fixture-place', false, null, 'fixture-release', 1,
    'sports_complex', 0.9, 'corralio-overture-match-v1', 'matched', now(),
    array['meta'], array['names'], array['CDLA-Permissive-2.0'],
    array['fixture-record'], array[null::timestamptz]
  );
  if v_second_evidence is distinct from v_evidence
  then raise exception 'evidence writer is not idempotent'; end if;
  if not public.corralio_provisional_venue_promotion_eligible_v1(
    'c4500000-0000-4000-8000-000000000001'
  ) then raise exception 'typed Overture evidence did not satisfy eligibility'; end if;

  if (select count(*) from public.corralio_overture_provenance
      where evidence_id = v_evidence) <> 1
  then raise exception 'evidence provenance was not atomic and idempotent'; end if;

  insert into public.corralio_overture_refreshes (
    overture_release, mode, max_venues, max_boxes, max_downloaded_bytes,
    max_candidates_examined, max_candidates_per_category,
    max_duration_seconds, max_concurrency, venues_considered, boxes_used,
    downloaded_bytes, candidates_examined
  ) values (
    'fixture-release', 'apply', 10, 10, 67108864, 10000, 15, 60, 1, 1, 1, 1000, 2
  ) returning id into v_refresh;

  insert into public.corralio_overture_refresh_scopes (
    refresh_id, provisional_venue_id, category
  ) values
    (v_refresh, 'c4500000-0000-4000-8000-000000000001', 'food'),
    (v_refresh, 'c4500000-0000-4000-8000-000000000001', 'coffee');
  insert into public.corralio_overture_candidates (
    refresh_id, provisional_venue_id, category, overture_feature_id,
    overture_release, overture_feature_version, name, latitude, longitude,
    overture_existence_confidence, distance_meters
  ) values (
    v_refresh, 'c4500000-0000-4000-8000-000000000001', 'food',
    'fixture-food', 'fixture-release', 1, 'Fixture Food', 47.5001, -122.2001, 0.9, 14
  );
  insert into public.corralio_overture_provenance (
    candidate_id, property_name, dataset, license_id, source_record_id
  ) select id, 'names', 'meta', 'CDLA-Permissive-2.0', 'fixture-food-record'
    from public.corralio_overture_candidates where refresh_id = v_refresh;
  if not public.corralio_activate_overture_refresh_v1(v_refresh)
     or not exists (
       select 1 from public.corralio_overture_candidates
       where refresh_id = v_refresh and active and activated_at is not null
     ) then raise exception 'atomic activation failed'; end if;

  insert into public.corralio_overture_refreshes (
    overture_release, mode, max_venues, max_boxes, max_downloaded_bytes,
    max_candidates_examined, max_candidates_per_category,
    max_duration_seconds, max_concurrency, venues_considered, boxes_used,
    downloaded_bytes, candidates_examined
  ) values (
    'newer-fixture-release', 'apply', 10, 10, 67108864, 10000, 15, 60, 1, 1, 1, 1000, 1
  ) returning id into v_failed;
  if not public.corralio_fail_overture_refresh_v1(v_failed, 'injected_failure')
     or not exists (
       select 1 from public.corralio_overture_candidates
       where refresh_id = v_refresh and active
     ) then raise exception 'failed refresh did not preserve active pool'; end if;

  begin
    insert into public.corralio_overture_provenance (
      candidate_id, dataset, license_id
    ) select id, 'foursquare', 'Apache-2.0-approved'
      from public.corralio_overture_candidates where refresh_id = v_refresh limit 1;
    raise exception 'Foursquare provenance unexpectedly accepted';
  exception when check_violation then null;
  end;
end
$test$;

select 'SLICE 4.5 BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO'
  as corralio_slice45_behavioral_verification;

rollback;
