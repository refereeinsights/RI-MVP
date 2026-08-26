import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseProvisionalPlaceIdentity } from "./provisionalVenues";
import { buildIcsEvidenceFingerprints } from "./provisionalVenueEvidence";
import { eventLocationText, venueAliasLookupForLocation, type VenueMatchEvent } from "./venueMatching";

const EVENT_LIMIT = 200;

type EligibleEvent = VenueMatchEvent & {
  originType: string;
  latitude: number | null;
  longitude: number | null;
  geocodedAt: string | null;
  sourceId: string | null;
  sourceEventUid: string | null;
};

function databaseFailure() {
  throw new Error("Provisional venue database operation failed");
}

function asEvent(value: unknown): EligibleEvent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.origin_type !== "string") return null;
  return {
    id: row.id,
    originType: row.origin_type,
    sourceLocationText: typeof row.source_location_text === "string" ? row.source_location_text : null,
    displayLocationText: typeof row.display_location_text === "string" ? row.display_location_text : null,
    latitude: typeof row.location_lat === "number" ? row.location_lat : null,
    longitude: typeof row.location_lng === "number" ? row.location_lng : null,
    geocodedAt: typeof row.location_geocoded_at === "string" ? row.location_geocoded_at : null,
    sourceId: typeof row.schedule_source_id === "string" ? row.schedule_source_id : null,
    sourceEventUid: typeof row.source_event_uid === "string" ? row.source_event_uid : null,
  };
}

export async function createOrReuseProvisionalVenues(admin: SupabaseClient, input: {
  householdId: string;
  eventIds: readonly string[];
}) {
  const eventIds = [...new Set(input.eventIds.filter(Boolean))].slice(0, EVENT_LIMIT);
  if (!eventIds.length) return { considered: 0, created: 0, reused: 0, blocked: 0 };
  const fingerprintKey = process.env.CORRALIO_EVIDENCE_FINGERPRINT_KEY?.trim();
  if (!fingerprintKey) throw new Error("Provisional venue evidence configuration missing");

  const [{ data: eventData, error: eventError }, { data: matchData, error: matchError }] = await Promise.all([
    admin.from("corralio_events")
      .select("id,origin_type,schedule_source_id,source_event_uid,source_location_text,display_location_text,location_lat,location_lng,location_geocoded_at")
      .eq("household_id", input.householdId)
      .eq("origin_type", "ics")
      .in("id", eventIds),
    admin.from("corralio_event_venue_matches")
      .select("event_id,match_status")
      .eq("household_id", input.householdId)
      .eq("match_status", "unmatched")
      .in("event_id", eventIds),
  ]);
  if (eventError || matchError || !Array.isArray(eventData) || !Array.isArray(matchData)) databaseFailure();

  const unmatchedIds = new Set((matchData as Array<{ event_id?: unknown }>).flatMap((row) =>
    typeof row.event_id === "string" ? [row.event_id] : [],
  ));
  const events = (eventData as unknown[]).map(asEvent);
  if (events.some((event) => event === null)) databaseFailure();

  const stats = { considered: 0, created: 0, reused: 0, blocked: 0 };
  for (const event of events as EligibleEvent[]) {
    if (
      event.originType !== "ics"
      || !unmatchedIds.has(event.id)
      || event.latitude === null
      || event.longitude === null
      || !event.geocodedAt
      || !event.sourceId
      || !event.sourceEventUid
    ) continue;
    const identity = parseProvisionalPlaceIdentity(eventLocationText(event));
    if (!identity) continue;
    const fingerprints = buildIcsEvidenceFingerprints({
      key: fingerprintKey,
      sourceId: event.sourceId,
      sourceEventUid: event.sourceEventUid,
      provisionalIdentityKey: identity.identityKey,
    });
    stats.considered += 1;

    const { data, error } = await admin.rpc("corralio_create_or_reuse_provisional_venue_v2", {
      p_household_id: input.householdId,
      p_event_id: event.id,
      p_identity_key: identity.identityKey,
      p_place_name: identity.placeName,
      p_normalized_place_name: identity.normalizedPlaceName,
      p_normalized_address: identity.normalizedAddress,
      p_city: identity.city,
      p_state: identity.state,
      p_latitude: event.latitude,
      p_longitude: event.longitude,
      p_normalizer_version: identity.normalizerVersion,
      p_observation_fingerprint: fingerprints.observationFingerprint,
      p_source_scope_fingerprint: fingerprints.sourceScopeFingerprint,
      p_fingerprint_version: fingerprints.fingerprintVersion,
    });
    if (error || !Array.isArray(data) || typeof data[0]?.outcome !== "string") databaseFailure();
    const outcome = data[0].outcome;
    if (outcome === "created") stats.created += 1;
    else if (outcome === "reused" || outcome === "redirected_provisional") stats.reused += 1;
    else stats.blocked += 1;

    const provisionalVenueId = typeof data[0]?.provisional_venue_id === "string"
      ? data[0].provisional_venue_id
      : null;
    const alias = provisionalVenueId
      ? venueAliasLookupForLocation(eventLocationText(event))
      : null;
    if (alias) {
      const { error: aliasError } = await admin.from("corralio_venue_aliases").upsert({
        alias_kind: alias.kind,
        normalized_alias: alias.normalizedAlias,
        normalized_city: alias.normalizedCity,
        state: alias.state,
        canonical_venue_id: null,
        provisional_venue_id: provisionalVenueId,
        evidence_source: "validated_provisional_creation",
        normalizer_version: "corralio-venue-alias-v1",
      }, {
        onConflict: "alias_kind,normalized_alias,normalized_city,state",
        ignoreDuplicates: true,
      });
      if (aliasError) databaseFailure();
    }
  }
  return stats;
}
