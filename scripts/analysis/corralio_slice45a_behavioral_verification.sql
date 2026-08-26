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
  v_incoherent_tag uuid;
  v_candidate uuid;
  v_active_candidate uuid;
  v_untagged_candidate uuid;
  v_provenance uuid;
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
    'status_unknown', 'corralio-overture-candidate-quality-v2',
    'corralio-overture-dedupe-v2', 'fixture-food', 'fixture-release', 1,
    'Fixture Local Food', 47.5001, -122.2001, 0.9, 14
  ) returning id into v_active_candidate;

  insert into public.corralio_overture_provenance (
    candidate_id, property_name, dataset, license_id, source_record_id
  ) values (
    v_active_candidate, '/properties/taxonomy', 'meta', 'CDLA-Permissive-2.0', 'fixture-food-record'
  ) returning id into v_provenance;

  insert into public.corralio_overture_candidate_food_tags (
    candidate_id, food_tag, tag_rule_version, evidence_field, provenance_id
  ) values (
    v_active_candidate, 'mexican', 'corralio-overture-food-tags-v1',
    'taxonomy_primary', v_provenance
  );

  begin
    insert into public.corralio_overture_candidate_food_tags (
      candidate_id, food_tag, tag_rule_version, evidence_field, provenance_id
    ) values (
      v_active_candidate, 'unsupported', 'corralio-overture-food-tags-v1',
      'taxonomy_primary', v_provenance
    );
    raise exception 'unsupported food tag unexpectedly accepted';
  exception when check_violation then null;
  end;

  insert into public.corralio_overture_candidates (
    refresh_id, provisional_venue_id, category, intent_category, operating_status,
    quality_rule_version, dedupe_rule_version, overture_feature_id,
    overture_release, overture_feature_version, name, latitude, longitude,
    overture_existence_confidence, distance_meters
  ) values (
    v_refresh, 'c45a0000-0000-4000-8000-000000000001', 'coffee', 'coffee',
    'confirmed_open', 'corralio-overture-candidate-quality-v2',
    'corralio-overture-dedupe-v2', 'fixture-coffee', 'fixture-release', 1,
    'Fixture Coffee Without Tag', 47.5002, -122.2002, 0.9, 20
  ) returning id into v_untagged_candidate;
  insert into public.corralio_overture_provenance (
    candidate_id, property_name, dataset, license_id, source_record_id
  ) values (
    v_untagged_candidate, 'names', 'meta', 'CDLA-Permissive-2.0', 'fixture-coffee-record'
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
      and exists (
        select 1 from public.corralio_overture_candidate_food_tags food_tag
        where food_tag.candidate_id = v_active_candidate
          and food_tag.food_tag = 'mexican'
      )
  ) then
    raise exception 'typed active state missing';
  end if;
  if not exists (
    select 1 from public.corralio_overture_candidates
    where id = v_untagged_candidate and active
  ) or exists (
    select 1 from public.corralio_overture_candidate_food_tags
    where candidate_id = v_untagged_candidate
  ) then
    raise exception 'valid candidate without food tags was not preserved';
  end if;

  insert into public.corralio_overture_refreshes (
    overture_release, mode, max_venues, max_boxes, max_downloaded_bytes,
    max_candidates_examined, max_candidates_per_category,
    max_duration_seconds, max_concurrency, venues_considered, boxes_used,
    downloaded_bytes, candidates_examined
  ) values (
    'tag-incoherent-release', 'apply', 10, 10, 67108864, 10000, 15, 60, 1, 1, 1, 1000, 1
  ) returning id into v_incoherent_tag;
  insert into public.corralio_overture_refresh_scopes (
    refresh_id, provisional_venue_id, category
  ) values (v_incoherent_tag, 'c45a0000-0000-4000-8000-000000000001', 'coffee');
  insert into public.corralio_overture_candidates (
    refresh_id, provisional_venue_id, category, intent_category,
    overture_feature_id, overture_release, overture_feature_version, name,
    latitude, longitude, overture_existence_confidence, distance_meters
  ) values (
    v_incoherent_tag, 'c45a0000-0000-4000-8000-000000000001', 'coffee', 'coffee',
    'tagged-coffee', 'tag-incoherent-release', 1, 'Tagged Coffee',
    47.5, -122.2, 0.9, 1
  ) returning id into v_candidate;
  insert into public.corralio_overture_provenance (
    candidate_id, property_name, dataset, license_id, source_record_id
  ) values (
    v_candidate, null, 'meta', 'CDLA-Permissive-2.0', 'tagged-coffee-record'
  ) returning id into v_provenance;
  begin
    insert into public.corralio_overture_candidate_food_tags (
      candidate_id, food_tag, tag_rule_version, evidence_field, provenance_id
    ) values (
      v_candidate, 'american', 'corralio-overture-food-tags-v1',
      'category_alternates', v_provenance
    );
    raise exception 'pool/tag incoherence unexpectedly accepted';
  exception when check_violation then null;
  end;
  if not exists (
       select 1 from public.corralio_overture_candidate_food_tags
       where candidate_id = v_active_candidate and food_tag = 'mexican'
     )
  then
    raise exception 'pool/tag coherence failure changed prior active tags';
  end if;
  perform public.corralio_fail_overture_refresh_v1(v_incoherent_tag, 'tag_incoherent');

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
     or not exists (
       select 1 from public.corralio_overture_candidate_food_tags
       where candidate_id = v_active_candidate and food_tag = 'mexican'
     )
  then
    raise exception 'failed refresh did not preserve prior typed pool and food tags';
  end if;
end
$test$;

select 'SLICE 4.5A BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO'
  as corralio_slice45a_behavioral_verification;

rollback;
