-- Network-free, rollback-only Slice 4.5A database behavioral verification.
-- Pure classification and deduplication behavior is tested in TypeScript.
begin;

insert into public.corralio_provisional_venues (
  id, identity_key, place_name, normalized_place_name, normalized_address,
  city, state, latitude, longitude, normalizer_version
) values (
  'c45a0000-0000-4000-8000-000000000001',
  repeat('a', 64), 'Slice 45A Fixture Sports', 'slice 45a fixture sports',
  '45a fixture way', 'fixture city', 'WA', 47.5, -122.2,
  'corralio-provisional-v1'
);

do $test$
declare
  v_refresh uuid;
  v_failed uuid;
  v_closed uuid;
  v_overcap uuid;
  v_candidate uuid;
  v_active_candidate uuid;
  v_activated boolean;
begin
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
    (v_refresh, 'c45a0000-0000-4000-8000-000000000001', 'food'),
    (v_refresh, 'c45a0000-0000-4000-8000-000000000001', 'coffee');

  begin
    insert into public.corralio_overture_candidates (
      refresh_id, provisional_venue_id, category, intent_category,
      overture_feature_id, overture_release, overture_feature_version,
      name, latitude, longitude, overture_existence_confidence, distance_meters
    ) values (
      v_refresh, 'c45a0000-0000-4000-8000-000000000001', 'coffee', 'pizza',
      'invalid-coherence', 'fixture-release', 1, 'Invalid', 47.5, -122.2, 0.9, 1
    );
    raise exception 'invalid pool/intent coherence unexpectedly accepted';
  exception when check_violation then null;
  end;

  insert into public.corralio_overture_candidates (
    refresh_id, provisional_venue_id, category, intent_category, operating_status,
    quality_rule_version, dedupe_rule_version, overture_feature_id,
    overture_release, overture_feature_version, name, latitude, longitude,
    overture_existence_confidence, distance_meters
  ) values (
    v_refresh, 'c45a0000-0000-4000-8000-000000000001', 'food', 'quick_service',
    'status_unknown', 'corralio-overture-candidate-quality-v1',
    'corralio-overture-dedupe-v1', 'fixture-food', 'fixture-release', 1,
    'Fixture Local Food', 47.5001, -122.2001, 0.9, 14
  ) returning id into v_active_candidate;

  insert into public.corralio_overture_provenance (
    candidate_id, property_name, dataset, license_id, source_record_id
  ) values (
    v_active_candidate, 'names', 'meta', 'CDLA-Permissive-2.0', 'fixture-food-record'
  );

  v_activated := public.corralio_activate_overture_refresh_v1(v_refresh);
  if v_activated is distinct from true then
    raise exception 'typed candidate activation failed';
  end if;
  if not exists (
    select 1 from public.corralio_overture_candidates
    where id = v_active_candidate and active and activated_at is not null
      and intent_category = 'quick_service'
      and operating_status = 'status_unknown'
  ) then
    raise exception 'typed active state missing';
  end if;

  insert into public.corralio_overture_refreshes (
    overture_release, mode, max_venues, max_boxes, max_downloaded_bytes,
    max_candidates_examined, max_candidates_per_category,
    max_duration_seconds, max_concurrency, venues_considered, boxes_used,
    downloaded_bytes, candidates_examined
  ) values (
    'closed-fixture-release', 'apply', 10, 10, 67108864, 10000, 15, 60, 1, 1, 1, 1000, 1
  ) returning id into v_closed;
  insert into public.corralio_overture_refresh_scopes (
    refresh_id, provisional_venue_id, category
  ) values (v_closed, 'c45a0000-0000-4000-8000-000000000001', 'food');
  insert into public.corralio_overture_candidates (
    refresh_id, provisional_venue_id, category, intent_category, operating_status,
    overture_feature_id, overture_release, overture_feature_version, name,
    latitude, longitude, overture_existence_confidence, distance_meters
  ) values (
    v_closed, 'c45a0000-0000-4000-8000-000000000001', 'food', 'other_food',
    'confirmed_closed', 'closed-food', 'closed-fixture-release', 1, 'Closed Food',
    47.5, -122.2, 0.99, 1
  ) returning id into v_candidate;
  insert into public.corralio_overture_provenance (
    candidate_id, property_name, dataset, license_id, source_record_id
  ) values (v_candidate, 'names', 'meta', 'CDLA-Permissive-2.0', 'closed-record');
  if public.corralio_activate_overture_refresh_v1(v_closed) is distinct from false
     or not exists (
       select 1 from public.corralio_overture_candidates
       where refresh_id = v_refresh and active
     )
  then
    raise exception 'confirmed-closed activation was not rejected atomically';
  end if;
  perform public.corralio_fail_overture_refresh_v1(v_closed, 'quality_rejected');

  insert into public.corralio_overture_refreshes (
    overture_release, mode, max_venues, max_boxes, max_downloaded_bytes,
    max_candidates_examined, max_candidates_per_category,
    max_duration_seconds, max_concurrency, venues_considered, boxes_used,
    downloaded_bytes, candidates_examined
  ) values (
    'overcap-fixture-release', 'apply', 10, 10, 67108864, 10000, 1, 60, 1, 1, 1, 1000, 2
  ) returning id into v_overcap;
  insert into public.corralio_overture_refresh_scopes (
    refresh_id, provisional_venue_id, category
  ) values (v_overcap, 'c45a0000-0000-4000-8000-000000000001', 'food');
  insert into public.corralio_overture_candidates (
    refresh_id, provisional_venue_id, category, intent_category,
    overture_feature_id, overture_release, overture_feature_version, name,
    latitude, longitude, overture_existence_confidence, distance_meters
  ) values
    (v_overcap, 'c45a0000-0000-4000-8000-000000000001', 'food', 'quick_service',
      'overcap-food-1', 'overcap-fixture-release', 1, 'Food One', 47.5, -122.2, 0.9, 1),
    (v_overcap, 'c45a0000-0000-4000-8000-000000000001', 'food', 'pizza',
      'overcap-food-2', 'overcap-fixture-release', 1, 'Food Two', 47.5, -122.2, 0.9, 2);
  insert into public.corralio_overture_provenance (
    candidate_id, property_name, dataset, license_id, source_record_id
  ) select id, 'names', 'meta', 'CDLA-Permissive-2.0', overture_feature_id
    from public.corralio_overture_candidates where refresh_id = v_overcap;
  if public.corralio_activate_overture_refresh_v1(v_overcap) is distinct from false
     or not exists (
       select 1 from public.corralio_overture_candidates
       where refresh_id = v_refresh and active
     )
  then
    raise exception 'over-cap activation was not rejected atomically';
  end if;
  perform public.corralio_fail_overture_refresh_v1(v_overcap, 'cap_rejected');

  insert into public.corralio_overture_refreshes (
    overture_release, mode, max_venues, max_boxes, max_downloaded_bytes,
    max_candidates_examined, max_candidates_per_category,
    max_duration_seconds, max_concurrency, venues_considered, boxes_used,
    downloaded_bytes, candidates_examined
  ) values (
    'failed-fixture-release', 'apply', 10, 10, 67108864, 10000, 15, 60, 1, 1, 1, 1000, 1
  ) returning id into v_failed;

  if not public.corralio_fail_overture_refresh_v1(v_failed, 'injected_failure')
     or not exists (
       select 1 from public.corralio_overture_candidates
       where id = v_active_candidate and active
     )
  then
    raise exception 'failed refresh did not preserve prior typed pool';
  end if;
end
$test$;

select 'SLICE 4.5A BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO'
  as corralio_slice45a_behavioral_verification;

rollback;
