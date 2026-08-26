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

insert into public.corralio_provisional_venues (
  id, identity_key, place_name, normalized_place_name, normalized_address,
  city, state, latitude, longitude, normalizer_version
) values
  (
    'c4500000-0000-4000-8000-000000000003', repeat('8',64),
    'Slice 45 Suppressed Fixture', 'slice 45 suppressed fixture', '451 fixture way',
    'fixture city', 'WA', 47.5002, -122.2002, 'corralio-provisional-v1'
  );

do $test$
declare
  v_evidence uuid;
  v_second_evidence uuid;
  v_refresh uuid;
  v_failed uuid;
  v_activated boolean;
  v_resolution record;
  v_canonical record;
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

  select * into v_resolution
  from public.corralio_resolve_provisional_enrichment_target_v1(
    'c4500000-0000-4000-8000-000000000001'
  );
  if v_resolution.target_type is distinct from 'provisional'
     or v_resolution.target_id is distinct from 'c4500000-0000-4000-8000-000000000001'::uuid
     or v_resolution.lifecycle_status is distinct from 'active'
  then raise exception 'active lifecycle resolution failed'; end if;

  insert into public.corralio_provisional_venues (
    id, identity_key, place_name, normalized_place_name, normalized_address,
    city, state, latitude, longitude, normalizer_version
  ) values (
    'c4500000-0000-4000-8000-000000000002', repeat('7',64),
    'Slice 45 Fixture Sports', 'slice 45 fixture sports', '450 fixture way',
    'fixture city', 'WA', 47.5, -122.2, 'corralio-provisional-v1'
  );

  if not public.corralio_merge_provisional_venue_exact_v1(
    'c4500000-0000-4000-8000-000000000002',
    'c4500000-0000-4000-8000-000000000001'
  ) then raise exception 'merge fixture transition failed'; end if;
  select * into v_resolution
  from public.corralio_resolve_provisional_enrichment_target_v1(
    'c4500000-0000-4000-8000-000000000002'
  );
  if v_resolution.target_type is distinct from 'provisional'
     or v_resolution.target_id is distinct from 'c4500000-0000-4000-8000-000000000001'::uuid
     or v_resolution.lifecycle_status is distinct from 'merged'
  then raise exception 'merged lifecycle resolution failed'; end if;

  if not public.corralio_suppress_provisional_venue_v2(
    'c4500000-0000-4000-8000-000000000003', 'privacy_or_quality'
  ) then raise exception 'suppression fixture transition failed'; end if;
  select * into v_resolution
  from public.corralio_resolve_provisional_enrichment_target_v1(
    'c4500000-0000-4000-8000-000000000003'
  );
  if v_resolution.target_type is not null
     or v_resolution.target_id is not null
     or v_resolution.lifecycle_status is distinct from 'suppressed'
  then raise exception 'suppressed lifecycle resolution redirected'; end if;

  select venue.id, venue.name, venue.city, venue.state, trusted.latitude, trusted.longitude
  into v_canonical
  from public.venues_public venue
  join public.venues trusted on trusted.id = venue.id
  where trusted.latitude between -90 and 90
    and trusted.longitude between -180 and 180
    and length(btrim(venue.name)) between 2 and 160
    and length(btrim(venue.city)) between 1 and 100
    and length(public.identity_normalize_text(venue.name)) between 2 and 200
    and length(public.identity_normalize_text(venue.city)) between 1 and 100
    and upper(btrim(venue.state)) ~ '^[A-Z]{2}$'
  order by venue.id
  limit 1;
  if v_canonical.id is null then raise exception 'stable canonical resolver fixture unavailable'; end if;

  insert into public.corralio_provisional_venues (
    id, identity_key, place_name, normalized_place_name, normalized_address,
    city, state, latitude, longitude, normalizer_version
  ) values (
    'c4500000-0000-4000-8000-000000000004', repeat('9',64),
    btrim(v_canonical.name), public.identity_normalize_text(v_canonical.name), null,
    public.identity_normalize_text(v_canonical.city), upper(btrim(v_canonical.state)),
    v_canonical.latitude, v_canonical.longitude, 'corralio-provisional-v1'
  );
  if not public.corralio_reconcile_provisional_venue_v1(
    'c4500000-0000-4000-8000-000000000004', v_canonical.id
  ) then raise exception 'reconciliation fixture transition failed'; end if;
  select * into v_resolution
  from public.corralio_resolve_provisional_enrichment_target_v1(
    'c4500000-0000-4000-8000-000000000004'
  );
  if v_resolution.target_type is distinct from 'canonical'
     or v_resolution.target_id is distinct from v_canonical.id
     or v_resolution.lifecycle_status is distinct from 'reconciled'
  then raise exception 'reconciled lifecycle resolution failed'; end if;

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
    overture_existence_confidence, distance_meters, intent_category,
    operating_status, quality_rule_version, dedupe_rule_version
  ) values (
    v_refresh, 'c4500000-0000-4000-8000-000000000001', 'food',
    'fixture-food', 'fixture-release', 1, 'Fixture Food', 47.5001, -122.2001, 0.9, 14,
    'other_food', 'confirmed_open',
    'corralio-overture-candidate-quality-v2', 'corralio-overture-dedupe-v2'
  );
  insert into public.corralio_overture_provenance (
    candidate_id, property_name, dataset, license_id, source_record_id
  ) select id, 'names', 'meta', 'CDLA-Permissive-2.0', 'fixture-food-record'
    from public.corralio_overture_candidates where refresh_id = v_refresh;
  v_activated := public.corralio_activate_overture_refresh_v1(v_refresh);
  if v_activated is distinct from true
  then raise exception 'atomic activation returned false'; end if;
  if not exists (
    select 1 from public.corralio_overture_candidates
    where refresh_id = v_refresh and active and activated_at is not null
  ) then raise exception 'atomic activation state was not visible'; end if;

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
