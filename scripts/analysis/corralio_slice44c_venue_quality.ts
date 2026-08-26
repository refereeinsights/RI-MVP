import { createClient } from "@supabase/supabase-js";

import { parseProvisionalPlaceIdentity } from "../../apps/corralio/lib/provisionalVenues";
import {
  CORRALIO_ELIGIBILITY_RULE_VERSION,
  evaluateProvisionalPromotionEligibilityV1,
} from "../../apps/corralio/lib/provisionalVenueEvidence";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Required Supabase environment is missing");

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function allRows(table: string, columns: string) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error || !Array.isArray(data)) throw new Error("Venue quality report query failed");
    rows.push(...data);
    if (data.length < 1000) return rows as Array<Record<string, unknown>>;
  }
}

async function optionalRows(table: string, columns: string) {
  const { data, error } = await supabase.from(table).select(columns).range(0, 999);
  if (error) {
    if (error.code === "42P01" || /does not exist/i.test(error.message)) return [];
    throw new Error("Venue quality report query failed");
  }
  if (!Array.isArray(data)) throw new Error("Venue quality report query failed");
  return data as unknown as Array<Record<string, unknown>>;
}

async function optionalOvertureCandidateRows(): Promise<Array<Record<string, unknown>>> {
  const typedColumns =
    "id,canonical_venue_id,provisional_venue_id,category,intent_category,operating_status,overture_feature_id,name,latitude,longitude,active";
  const { data, error } = await supabase
    .from("corralio_overture_candidates")
    .select(typedColumns)
    .range(0, 999);
  if (!error) {
    if (!Array.isArray(data)) throw new Error("Venue quality report query failed");
    return data as unknown as Array<Record<string, unknown>>;
  }
  if (error.code === "42P01" || /does not exist/i.test(error.message)) return [];
  if (error.code !== "42703" && !/column .* does not exist/i.test(error.message)) {
    throw new Error("Venue quality report query failed");
  }

  // Keep the read-only report usable during the human-controlled migration gate.
  const legacyRows = await optionalRows(
    "corralio_overture_candidates",
    "id,canonical_venue_id,provisional_venue_id,category,overture_feature_id,name,latitude,longitude,active",
  );
  return legacyRows.map((row): Record<string, unknown> => ({
    ...row,
    intent_category: row.category === "coffee" ? "coffee" : "other_food",
    operating_status: "status_unknown",
  }));
}

function distribution(values: number[]) {
  const buckets = new Map<number, number>();
  for (const value of values) buckets.set(value, (buckets.get(value) ?? 0) + 1);
  return Object.fromEntries([...buckets].sort(([a], [b]) => a - b).map(([key, count]) => [String(key), count]));
}

async function main() {
  const [events, matches, provisional, evidence, overtureCandidates, overtureFoodTags, overtureRefreshes] = await Promise.all([
    allRows("corralio_events", "id,origin_type,source_location_text,display_location_text,location_lat,location_lng,location_geocoded_at"),
    allRows("corralio_event_venue_matches", "event_id,match_status,provisional_venue_id"),
    allRows("corralio_provisional_venues", "id,normalized_place_name,city,state,lifecycle_status"),
    allRows("corralio_provisional_venue_evidence", "provisional_venue_id,evidence_type,source_scope_fingerprint"),
    optionalOvertureCandidateRows(),
    optionalRows("corralio_overture_candidate_food_tags", "candidate_id,food_tag,tag_rule_version,evidence_field"),
    optionalRows("corralio_overture_refreshes", "status,overture_release,venues_considered,candidates_examined"),
  ]);

  const matchByEvent = new Map(matches.flatMap((row) =>
    typeof row.event_id === "string" ? [[row.event_id, row] as const] : [],
  ));
  let successfullyGeocodedIcs = 0;
  let privateOrNonVenueExcluded = 0;
  let eligibleNamedLocations = 0;
  let canonicalAssociations = 0;
  let provisionalAssociations = 0;
  let unresolvedEligible = 0;

  for (const event of events) {
    if (
      event.origin_type !== "ics"
      || typeof event.id !== "string"
      || typeof event.location_lat !== "number"
      || typeof event.location_lng !== "number"
      || typeof event.location_geocoded_at !== "string"
    ) continue;
    successfullyGeocodedIcs += 1;
    const match = matchByEvent.get(event.id);
    const status = typeof match?.match_status === "string" ? match.match_status : null;
    const location = typeof event.source_location_text === "string"
      ? event.source_location_text
      : typeof event.display_location_text === "string" ? event.display_location_text : null;
    const identity = status === "private_skipped" || status === "insufficient_location"
      ? null
      : parseProvisionalPlaceIdentity(location);
    if (!identity) {
      privateOrNonVenueExcluded += 1;
      continue;
    }
    eligibleNamedLocations += 1;
    if (status === "matched") canonicalAssociations += 1;
    else if (status === "provisional") provisionalAssociations += 1;
    else unresolvedEligible += 1;
  }

  const lifecycleCounts = { active: 0, suppressed: 0, merged: 0, reconciled: 0 };
  const activeGroups = new Map<string, number>();
  for (const row of provisional) {
    const status = row.lifecycle_status;
    if (status === "active" || status === "suppressed" || status === "merged" || status === "reconciled") {
      lifecycleCounts[status] += 1;
    }
    if (status !== "active" || typeof row.normalized_place_name !== "string" || typeof row.city !== "string" || typeof row.state !== "string") continue;
    const key = `${row.normalized_place_name}\0${row.city}\0${row.state}`;
    activeGroups.set(key, (activeGroups.get(key) ?? 0) + 1);
  }
  const duplicateIds = new Set<string>();
  for (const row of provisional) {
    if (row.lifecycle_status !== "active" || typeof row.id !== "string") continue;
    const key = `${row.normalized_place_name}\0${row.city}\0${row.state}`;
    if ((activeGroups.get(key) ?? 0) > 1) duplicateIds.add(row.id);
  }

  const evidenceByVenue = new Map<string, Array<Record<string, unknown>>>();
  for (const row of evidence) {
    if (typeof row.provisional_venue_id !== "string") continue;
    evidenceByVenue.set(row.provisional_venue_id, [...(evidenceByVenue.get(row.provisional_venue_id) ?? []), row]);
  }
  const rawObservationCounts: number[] = [];
  const distinctSourceScopeCounts: number[] = [];
  const strongTypeCounts = new Map<string, number>();
  let promotionEligibleCount = 0;
  for (const row of provisional) {
    if (typeof row.id !== "string") continue;
    const rows = evidenceByVenue.get(row.id) ?? [];
    rawObservationCounts.push(rows.length);
    distinctSourceScopeCounts.push(new Set(rows.flatMap((item) =>
      typeof item.source_scope_fingerprint === "string" ? [item.source_scope_fingerprint] : [],
    )).size);
    const evidenceTypes = rows.flatMap((item) => typeof item.evidence_type === "string" ? [item.evidence_type] : []);
    for (const type of evidenceTypes) {
      if (type !== "ics_observation") strongTypeCounts.set(type, (strongTypeCounts.get(type) ?? 0) + 1);
    }
    if (
      (row.lifecycle_status === "active" || row.lifecycle_status === "suppressed" || row.lifecycle_status === "merged" || row.lifecycle_status === "reconciled")
      && evaluateProvisionalPromotionEligibilityV1({
        lifecycleStatus: row.lifecycle_status,
        evidenceTypes: evidenceTypes.filter((type): type is "ics_observation" | "overture_place_match" =>
          type === "ics_observation" || type === "overture_place_match"),
        hasIdentityConflict: duplicateIds.has(row.id),
        hasPrivacyBlocker: false,
        identityCoherent: true,
      }).eligible
    ) promotionEligibleCount += 1;
  }

  const associatedProvisionalIds = new Set(matches.flatMap((row) =>
    typeof row.provisional_venue_id === "string" ? [row.provisional_venue_id] : [],
  ));
  const zeroAssociationProvisional = provisional.filter((row) =>
    row.lifecycle_status === "active" && typeof row.id === "string" && !associatedProvisionalIds.has(row.id),
  ).length;
  const potentialDuplicateRows = duplicateIds.size;
  const percent = (value: number, denominator: number) => denominator ? Number((value * 100 / denominator).toFixed(2)) : 0;
  const identityKey = (row: Record<string, unknown>) =>
    typeof row.canonical_venue_id === "string" ? `canonical:${row.canonical_venue_id}`
      : typeof row.provisional_venue_id === "string" ? `provisional:${row.provisional_venue_id}` : null;
  const associatedIdentityEventCounts = new Map<string, number>();
  for (const row of matches) {
    const key = identityKey(row);
    if (key) associatedIdentityEventCounts.set(key, (associatedIdentityEventCounts.get(key) ?? 0) + 1);
  }
  const activeCandidates = overtureCandidates.filter((row) => row.active === true);
  const countByIdentityCategory = new Map<string, number>();
  const intentCategoryCounts = new Map<string, number>();
  const operatingStatusCounts = new Map<string, number>();
  const foodTagCounts = new Map<string, number>();
  const nearDuplicateKeys = new Set<string>();
  let duplicateCandidateRows = 0;
  for (const row of activeCandidates) {
    const key = identityKey(row);
    if (!key || (row.category !== "food" && row.category !== "coffee")) continue;
    const bucket = `${key}:${row.category}`;
    countByIdentityCategory.set(bucket, (countByIdentityCategory.get(bucket) ?? 0) + 1);
    if (typeof row.intent_category === "string") {
      intentCategoryCounts.set(row.intent_category, (intentCategoryCounts.get(row.intent_category) ?? 0) + 1);
    }
    if (typeof row.operating_status === "string") {
      operatingStatusCounts.set(row.operating_status, (operatingStatusCounts.get(row.operating_status) ?? 0) + 1);
    }
    const duplicateKey = [
      bucket,
      typeof row.name === "string" ? row.name.trim().toLowerCase() : "",
      typeof row.latitude === "number" ? row.latitude.toFixed(4) : "",
      typeof row.longitude === "number" ? row.longitude.toFixed(4) : "",
    ].join("\0");
    if (nearDuplicateKeys.has(duplicateKey)) duplicateCandidateRows += 1;
    nearDuplicateKeys.add(duplicateKey);
  }
  const identities = [...associatedIdentityEventCounts.keys()];
  const poolDistribution = (category: "food" | "coffee") => {
    const values = identities.map((key) => countByIdentityCategory.get(`${key}:${category}`) ?? 0);
    return {
      zero: values.filter((value) => value === 0).length,
      partial: values.filter((value) => value > 0 && value < 15).length,
      full: values.filter((value) => value >= 15).length,
    };
  };
  const foodFilled = identities.filter((key) => (countByIdentityCategory.get(`${key}:food`) ?? 0) > 0);
  const coffeeFilled = identities.filter((key) => (countByIdentityCategory.get(`${key}:coffee`) ?? 0) > 0);
  const quickFilledIdentityKeys = new Set(activeCandidates.flatMap((row) => {
    const key = identityKey(row);
    return key && ["quick_service", "pizza", "sandwiches"].includes(String(row.intent_category)) ? [key] : [];
  }));
  const activeFoodCandidateIds = new Set(activeCandidates.flatMap((row) =>
    row.category === "food" && typeof row.id === "string" ? [row.id] : [],
  ));
  const taggedFoodCandidateIds = new Set<string>();
  for (const row of overtureFoodTags) {
    if (typeof row.candidate_id !== "string" || !activeFoodCandidateIds.has(row.candidate_id)) continue;
    if (typeof row.food_tag !== "string") continue;
    taggedFoodCandidateIds.add(row.candidate_id);
    foodTagCounts.set(row.food_tag, (foodTagCounts.get(row.food_tag) ?? 0) + 1);
  }
  const weightedEvents = [...associatedIdentityEventCounts.values()].reduce((sum, value) => sum + value, 0);
  const weightedFoodEvents = foodFilled.reduce((sum, key) => sum + (associatedIdentityEventCounts.get(key) ?? 0), 0);
  const activeRefreshes = overtureRefreshes.filter((row) => row.status === "active").length;
  const failedRefreshes = overtureRefreshes.filter((row) => row.status === "failed").length;

  console.log(JSON.stringify({
    successfullyGeocodedIcs,
    privateOrNonVenueExcluded,
    eligibleNamedLocations,
    canonicalAssociations,
    provisionalAssociations,
    unresolvedEligible,
    canonicalMatchRatePercent: percent(canonicalAssociations, eligibleNamedLocations),
    provisionalAssociationRatePercent: percent(provisionalAssociations, eligibleNamedLocations),
    venueIdentityCoveragePercent: percent(canonicalAssociations + provisionalAssociations, eligibleNamedLocations),
    unresolvedRatePercent: percent(unresolvedEligible, eligibleNamedLocations),
    lifecycleCounts,
    zeroAssociationProvisional,
    potentialDuplicateRows,
    potentialDuplicateRatePercent: percent(potentialDuplicateRows, lifecycleCounts.active),
    rawObservationCountDistribution: distribution(rawObservationCounts),
    distinctIcsSourceScopeCountDistribution: distribution(distinctSourceScopeCounts),
    strongEvidenceTypeCounts: Object.fromEntries([...strongTypeCounts].sort(([a], [b]) => a.localeCompare(b))),
    eligibilityRuleVersion: CORRALIO_ELIGIBILITY_RULE_VERSION,
    promotionEligibleCount,
    overtureNearby: {
      venueLevelFoodFillRatePercent: percent(foodFilled.length, identities.length),
      eventWeightedFoodCandidateCoveragePercent: percent(weightedFoodEvents, weightedEvents),
      venueLevelCoffeeFillRatePercent: percent(coffeeFilled.length, identities.length),
      quickOptionFillRatePercent: percent(
        identities.filter((key) => quickFilledIdentityKeys.has(key)).length,
        identities.length,
      ),
      intentCategoryDistribution: Object.fromEntries([...intentCategoryCounts].sort(([a], [b]) => a.localeCompare(b))),
      operatingStatusDistribution: Object.fromEntries([...operatingStatusCounts].sort(([a], [b]) => a.localeCompare(b))),
      foodTagDistribution: Object.fromEntries([...foodTagCounts].sort(([a], [b]) => a.localeCompare(b))),
      foodCandidatesWithoutStoredTag: activeFoodCandidateIds.size - taggedFoodCandidateIds.size,
      poolDistribution: {
        food: poolDistribution("food"),
        coffee: poolDistribution("coffee"),
      },
      duplicateRatePercent: percent(duplicateCandidateRows, activeCandidates.length),
      enrichmentSuccessFailure: {
        activeRefreshes,
        failedRefreshes,
        successRatePercent: percent(activeRefreshes, activeRefreshes + failedRefreshes),
        failureRatePercent: percent(failedRefreshes, activeRefreshes + failedRefreshes),
      },
      activeCandidateCount: activeCandidates.length,
    },
  }, null, 2));
}

main().catch(() => {
  console.error("Corralio venue quality report failed");
  process.exitCode = 1;
});
