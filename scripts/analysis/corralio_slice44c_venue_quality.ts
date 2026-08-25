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

function distribution(values: number[]) {
  const buckets = new Map<number, number>();
  for (const value of values) buckets.set(value, (buckets.get(value) ?? 0) + 1);
  return Object.fromEntries([...buckets].sort(([a], [b]) => a - b).map(([key, count]) => [String(key), count]));
}

async function main() {
  const [events, matches, provisional, evidence] = await Promise.all([
    allRows("corralio_events", "id,origin_type,source_location_text,display_location_text,location_lat,location_lng,location_geocoded_at"),
    allRows("corralio_event_venue_matches", "event_id,match_status,provisional_venue_id"),
    allRows("corralio_provisional_venues", "id,normalized_place_name,city,state,lifecycle_status"),
    allRows("corralio_provisional_venue_evidence", "provisional_venue_id,evidence_type,source_scope_fingerprint"),
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
        evidenceTypes: evidenceTypes.filter((type): type is "ics_observation" => type === "ics_observation"),
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
  }, null, 2));
}

main().catch(() => {
  console.error("Corralio 4.4C venue quality report failed");
  process.exitCode = 1;
});
