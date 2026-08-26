import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CORRALIO_OVERTURE_MATCH_RULE_VERSION,
  CORRALIO_OVERTURE_CANDIDATE_QUALITY_RULE_VERSION,
  CORRALIO_OVERTURE_DEDUPE_RULE_VERSION,
  CORRALIO_OVERTURE_FOOD_TAG_RULE_VERSION,
  CORRALIO_OVERTURE_FOOD_TAGS,
  CORRALIO_OVERTURE_PROVISIONAL_CONFIDENCE_FLOOR,
  CORRALIO_OVERTURE_PROVISIONAL_POOL_CAP,
  CORRALIO_OVERTURE_STAGE1_BOUNDS,
  assertWithinOperationalBounds,
  buildOvertureEvidenceFingerprints,
  evaluateOvertureVenueMatch,
  evaluateOvertureCandidate,
  deriveAcceptedOvertureFoodTags,
  normalizeOvertureProvenance,
  selectOvertureCandidatesWithAudit,
  type OverturePlace,
  type SharedVenue,
} from "./overtureNearby";

export type OvertureVenueTarget =
  | { canonicalVenueId: string; provisionalVenueId?: never; venue: SharedVenue; places: readonly OverturePlace[] }
  | { canonicalVenueId?: never; provisionalVenueId: string; venue: SharedVenue; places: readonly OverturePlace[] };

function databaseFailure(phase: string): never {
  throw new Error(`Corralio Overture refresh failed: ${phase}`);
}

async function trustedTargets(admin: SupabaseClient, targets: readonly OvertureVenueTarget[]) {
  const resolved: OvertureVenueTarget[] = [];
  for (const target of targets) {
    if (target.canonicalVenueId) {
      const { data, error } = await admin.rpc("corralio_read_canonical_venue_coordinate_v1", {
        p_canonical_venue_id: target.canonicalVenueId,
      }).single();
      const coordinate = data as { latitude?: unknown; longitude?: unknown } | null;
      if (error) {
        if (error.message.includes("fetch failed")) databaseFailure("canonical_coordinate_transport");
        if (error.code === "PGRST116") databaseFailure("canonical_coordinate_row_count");
        if (error.code === "42501") databaseFailure("canonical_coordinate_permission");
        databaseFailure("canonical_coordinate_rpc");
      }
      if (
        !coordinate
        || typeof coordinate.latitude !== "number"
        || typeof coordinate.longitude !== "number"
      ) databaseFailure("canonical_coordinate_shape");
      resolved.push({
        ...target,
        venue: { ...target.venue, latitude: coordinate.latitude, longitude: coordinate.longitude },
      });
      continue;
    }
    const provisionalVenueId = target.provisionalVenueId;
    if (typeof provisionalVenueId !== "string") databaseFailure("provisional_resolution");
    const { data, error } = await admin.from("corralio_provisional_venues")
      .select("id,place_name,normalized_address,city,latitude,longitude,lifecycle_status")
      .eq("id", provisionalVenueId)
      .eq("lifecycle_status", "active")
      .single();
    if (
      error || !data
      || typeof data.place_name !== "string"
      || typeof data.city !== "string"
      || typeof data.latitude !== "number"
      || typeof data.longitude !== "number"
    ) databaseFailure("provisional_coordinate_read");
    resolved.push({
      provisionalVenueId,
      venue: {
        name: data.place_name,
        normalizedAddress: typeof data.normalized_address === "string" ? data.normalized_address : null,
        locality: data.city,
        latitude: data.latitude,
        longitude: data.longitude,
      },
      places: target.places,
    });
  }
  return resolved;
}

export async function refreshOvertureCandidatePools(admin: SupabaseClient, input: {
  release: string;
  targets: readonly OvertureVenueTarget[];
  downloadedBytes: number;
  boxesUsed: number;
  elapsedSeconds: number;
  dryRun: boolean;
}) {
  const candidatesExamined = input.targets.reduce((sum, target) => sum + target.places.length, 0);
  assertWithinOperationalBounds({
    venues: input.targets.length,
    boxes: input.boxesUsed,
    downloadedBytes: input.downloadedBytes,
    candidatesExamined,
    elapsedSeconds: input.elapsedSeconds,
    concurrency: CORRALIO_OVERTURE_STAGE1_BOUNDS.maxConcurrency,
  });

  const targets = input.dryRun ? input.targets : await trustedTargets(admin, input.targets);
  const selectionAudits = targets.map((target) => ({
    target,
    audit: selectOvertureCandidatesWithAudit(target.venue, target.places),
  }));
  const selected = selectionAudits.flatMap(({ target, audit }) =>
    audit.selected.map((candidate) => ({
      target,
      candidate,
      provenance: normalizeOvertureProvenance(candidate.place.sources)!,
      foodTags: deriveAcceptedOvertureFoodTags(candidate.place),
    })),
  );
  const physicalIdentityCollisions = selectionAudits.flatMap(({ target, audit }) => audit.collisions.map((collision) => ({
    canonicalVenueId: target.canonicalVenueId ?? null,
    provisionalVenueId: target.provisionalVenueId ?? null,
    ...collision,
  })));
  const eligibleBeforeCollision = selectionAudits.reduce((sum, row) => sum + row.audit.eligibleBeforeCollision, 0);
  const excludedByCollision = selectionAudits.reduce((sum, row) => sum + row.audit.excludedByCollision, 0);
  const candidateDecisions = targets.flatMap((target) => target.places.map((place) => evaluateOvertureCandidate(place)));
  const countBy = (values: readonly string[]) => Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length]),
  );
  const aggregate = {
    dryRun: input.dryRun,
    release: input.release,
    venuesConsidered: targets.length,
    boxesUsed: input.boxesUsed,
    downloadedBytes: input.downloadedBytes,
    candidatesExamined,
    candidatesSelected: selected.length,
    foodSelected: selected.filter((row) => row.candidate.category === "food").length,
    coffeeSelected: selected.filter((row) => row.candidate.category === "coffee").length,
    confidenceFloor: CORRALIO_OVERTURE_PROVISIONAL_CONFIDENCE_FLOOR,
    poolCap: CORRALIO_OVERTURE_PROVISIONAL_POOL_CAP,
    qualityRuleVersion: CORRALIO_OVERTURE_CANDIDATE_QUALITY_RULE_VERSION,
    dedupeRuleVersion: CORRALIO_OVERTURE_DEDUPE_RULE_VERSION,
    physicalIdentityCollisionGroups: physicalIdentityCollisions.length,
    physicalIdentityCollisionRate: eligibleBeforeCollision === 0 ? 0 : excludedByCollision / eligibleBeforeCollision,
    candidatesExcludedByCollision: excludedByCollision,
    unresolvedPhysicalIdentities: physicalIdentityCollisions.filter((collision) => collision.outcome === "unresolved_excluded").length,
    physicalIdentityCollisions,
    intentCategoryDistribution: countBy(selected.map((row) => row.candidate.intentCategory)),
    operatingStatusDistribution: countBy(selected.map((row) => row.candidate.operatingStatus)),
    foodTagRuleVersion: CORRALIO_OVERTURE_FOOD_TAG_RULE_VERSION,
    foodTagDistribution: Object.fromEntries(CORRALIO_OVERTURE_FOOD_TAGS.map((foodTag) => [
      foodTag,
      selected.flatMap((row) => row.foodTags).filter((tag) => tag.foodTag === foodTag).length,
    ])),
    candidatesWithoutFoodTags: selected.filter((row) =>
      row.candidate.category === "food" && row.foodTags.length === 0).length,
    rejectionReasonDistribution: countBy(candidateDecisions.filter((row) => !row.accepted).map((row) => row.reason)),
  };
  if (input.dryRun) return aggregate;

  const { data: refresh, error: refreshError } = await admin.from("corralio_overture_refreshes").insert({
    overture_release: input.release,
    mode: "apply",
    max_venues: CORRALIO_OVERTURE_STAGE1_BOUNDS.maxVenues,
    max_boxes: CORRALIO_OVERTURE_STAGE1_BOUNDS.maxBoxes,
    max_downloaded_bytes: CORRALIO_OVERTURE_STAGE1_BOUNDS.maxDownloadedBytes,
    max_candidates_examined: CORRALIO_OVERTURE_STAGE1_BOUNDS.maxCandidatesExamined,
    max_candidates_per_category: CORRALIO_OVERTURE_STAGE1_BOUNDS.maxCandidatesPerCategory,
    max_duration_seconds: CORRALIO_OVERTURE_STAGE1_BOUNDS.maxDurationSeconds,
    max_concurrency: CORRALIO_OVERTURE_STAGE1_BOUNDS.maxConcurrency,
    venues_considered: targets.length,
    boxes_used: input.boxesUsed,
    downloaded_bytes: input.downloadedBytes,
    candidates_examined: candidatesExamined,
  }).select("id").single();
  if (refreshError || typeof refresh?.id !== "string") databaseFailure("refresh_insert");
  const refreshId = refresh.id;

  try {
    const scopes = targets.flatMap((target) => (["food", "coffee"] as const).map((category) => ({
      refresh_id: refreshId,
      canonical_venue_id: target.canonicalVenueId ?? null,
      provisional_venue_id: target.provisionalVenueId ?? null,
      category,
    })));
    const { error: scopeError } = await admin.from("corralio_overture_refresh_scopes").insert(scopes);
    if (scopeError) databaseFailure("scope_insert");
    for (const row of selected) {
      const place = row.candidate.place;
      const { data: inserted, error } = await admin.from("corralio_overture_candidates").insert({
        refresh_id: refreshId,
        canonical_venue_id: row.target.canonicalVenueId ?? null,
        provisional_venue_id: row.target.provisionalVenueId ?? null,
        category: row.candidate.category,
        intent_category: row.candidate.intentCategory,
        operating_status: row.candidate.operatingStatus,
        quality_rule_version: CORRALIO_OVERTURE_CANDIDATE_QUALITY_RULE_VERSION,
        dedupe_rule_version: CORRALIO_OVERTURE_DEDUPE_RULE_VERSION,
        overture_feature_id: place.featureId,
        overture_gers_confirmed: place.gersConfirmed === true,
        overture_gers_id: place.gersConfirmed ? place.featureId : null,
        overture_release: place.release,
        overture_feature_version: place.featureVersion,
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        overture_existence_confidence: place.existenceConfidence,
        distance_meters: row.candidate.distanceMeters,
      }).select("id").single();
      if (error || typeof inserted?.id !== "string") databaseFailure("candidate_insert");
      const { data: insertedSources, error: sourceError } = await admin.from("corralio_overture_provenance").insert(
        row.provenance.map((source) => ({
          candidate_id: inserted.id,
          property_name: source.propertyName,
          dataset: source.dataset,
          license_id: source.licenseId,
          source_record_id: source.sourceRecordId,
          source_update_time: source.sourceUpdateTime,
        })),
      ).select("id,property_name,dataset,license_id,source_record_id,source_update_time");
      if (sourceError || !Array.isArray(insertedSources)) databaseFailure("provenance_insert");

      const foodTagRows = row.foodTags.map((tag) => {
        const sameTimestamp = (left: unknown, right: string | null) => left === right || (
          typeof left === "string"
          && right !== null
          && Number.isFinite(Date.parse(left))
          && Date.parse(left) === Date.parse(right)
        );
        const source = insertedSources.find((candidate) =>
          candidate.property_name === tag.provenance.propertyName
          && candidate.dataset === tag.provenance.dataset
          && candidate.license_id === tag.provenance.licenseId
          && candidate.source_record_id === tag.provenance.sourceRecordId
          && sameTimestamp(candidate.source_update_time, tag.provenance.sourceUpdateTime));
        if (!source || typeof source.id !== "string") databaseFailure("food_tag_provenance_resolution");
        return {
          candidate_id: inserted.id,
          food_tag: tag.foodTag,
          tag_rule_version: tag.ruleVersion,
          evidence_field: tag.evidenceField,
          provenance_id: source.id,
        };
      });
      if (foodTagRows.length) {
        const { error: foodTagError } = await admin.from("corralio_overture_candidate_food_tags").insert(foodTagRows);
        if (foodTagError) databaseFailure("food_tag_insert");
      }
    }
    const { data: activated, error } = await admin.rpc("corralio_activate_overture_refresh_v1", {
      p_refresh_id: refreshId,
    });
    if (error || activated !== true) databaseFailure("activation");
  } catch (error: unknown) {
    await admin.rpc("corralio_fail_overture_refresh_v1", {
      p_refresh_id: refreshId,
      p_failure_code: "bounded_refresh_failed",
    });
    if (error instanceof Error && /^Corralio Overture refresh failed: [a-z_]+$/.test(error.message)) {
      throw error;
    }
    databaseFailure("staging_write");
  }
  return aggregate;
}

export async function recordOvertureVenueCorroboration(admin: SupabaseClient, input: {
  fingerprintKey: string;
  provisionalVenueId: string;
  places: readonly OverturePlace[];
  matchedAt: string;
}) {
  const { data: provisional, error: provisionalError } = await admin.from("corralio_provisional_venues")
    .select("place_name,normalized_address,city,latitude,longitude,lifecycle_status")
    .eq("id", input.provisionalVenueId)
    .eq("lifecycle_status", "active")
    .single();
  if (
    provisionalError || !provisional
    || typeof provisional.place_name !== "string"
    || typeof provisional.city !== "string"
    || typeof provisional.latitude !== "number"
    || typeof provisional.longitude !== "number"
  ) databaseFailure("provisional_evidence_write");
  const match = evaluateOvertureVenueMatch({
    name: provisional.place_name,
    normalizedAddress: typeof provisional.normalized_address === "string" ? provisional.normalized_address : null,
    locality: provisional.city,
    latitude: provisional.latitude,
    longitude: provisional.longitude,
  }, input.places);
  if (match.outcome !== "matched" || !match.place) return { outcome: match.outcome, evidenceId: null };
  const provenance = normalizeOvertureProvenance(match.place.sources);
  if (!provenance) return { outcome: "excluded_provenance" as const, evidenceId: null };
  const fingerprints = buildOvertureEvidenceFingerprints({
    key: input.fingerprintKey,
    provisionalVenueId: input.provisionalVenueId,
    overtureFeatureId: match.place.featureId,
    release: match.place.release,
  });
  const { data, error } = await admin.rpc("corralio_record_overture_place_match_v1", {
    p_provisional_venue_id: input.provisionalVenueId,
    p_observation_fingerprint: fingerprints.observationFingerprint,
    p_source_scope_fingerprint: fingerprints.sourceScopeFingerprint,
    p_overture_feature_id: match.place.featureId,
    p_overture_gers_confirmed: match.place.gersConfirmed === true,
    p_overture_gers_id: match.place.gersConfirmed ? match.place.featureId : null,
    p_overture_release: match.place.release,
    p_overture_feature_version: match.place.featureVersion,
    p_overture_category: match.place.taxonomyPrimary ?? match.place.basicCategory ?? "unknown",
    p_overture_existence_confidence: match.place.existenceConfidence,
    p_match_rule_version: CORRALIO_OVERTURE_MATCH_RULE_VERSION,
    p_match_outcome: "matched",
    p_matched_at: input.matchedAt,
    p_source_datasets: provenance.map((source) => source.dataset),
    p_source_properties: provenance.map((source) => source.propertyName),
    p_source_license_ids: provenance.map((source) => source.licenseId),
    p_source_record_ids: provenance.map((source) => source.sourceRecordId),
    p_source_update_times: provenance.map((source) => source.sourceUpdateTime),
  });
  if (error || typeof data !== "string") databaseFailure("lifecycle_resolution");
  return { outcome: "matched" as const, evidenceId: data };
}
