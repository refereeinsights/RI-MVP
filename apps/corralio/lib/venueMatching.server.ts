import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  evaluateVenueMatches,
  type ExistingVenueMatch,
  type VenueCandidate,
  type VenueMatchEvent,
  type VenueMatchStatus,
} from "./venueMatching";

const VENUE_PAGE_SIZE = 500;
const IN_FILTER_BATCH_SIZE = 100;

function databaseFailure() {
  throw new Error("Venue matching database operation failed");
}

function batches<T>(values: readonly T[]) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += IN_FILTER_BATCH_SIZE) {
    result.push(values.slice(index, index + IN_FILTER_BATCH_SIZE));
  }
  return result;
}

function asEvent(value: unknown): VenueMatchEvent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  return {
    id: row.id,
    sourceLocationText: typeof row.source_location_text === "string" ? row.source_location_text : null,
    displayLocationText: typeof row.display_location_text === "string" ? row.display_location_text : null,
  };
}

function asExisting(value: unknown): ExistingVenueMatch | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const allowedStatuses: VenueMatchStatus[] = ["matched", "unmatched", "private_skipped", "insufficient_location"];
  if (
    typeof row.event_id !== "string"
    || typeof row.match_status !== "string"
    || !allowedStatuses.includes(row.match_status as VenueMatchStatus)
    || typeof row.location_fingerprint !== "string"
    || typeof row.matcher_version !== "string"
  ) return null;
  return {
    eventId: row.event_id,
    venueId: typeof row.venue_id === "string" ? row.venue_id : null,
    matchStatus: row.match_status as VenueMatchStatus,
    locationFingerprint: row.location_fingerprint,
    matcherVersion: row.matcher_version,
    recheckAfter: typeof row.recheck_after === "string" ? row.recheck_after : null,
  };
}

function asCandidate(value: unknown): VenueCandidate | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  return {
    id: row.id,
    name: typeof row.name === "string" ? row.name : null,
    address: typeof row.address === "string" ? row.address : null,
    city: typeof row.city === "string" ? row.city : null,
    state: typeof row.state === "string" ? row.state : null,
  };
}

async function listCompleteCandidateScope(admin: SupabaseClient, state: string) {
  const candidates: VenueCandidate[] = [];
  let queryCount = 0;
  for (let offset = 0; ; offset += VENUE_PAGE_SIZE) {
    queryCount += 1;
    const { data, error } = await admin
      .from("venues_public")
      .select("id,name,address,city,state")
      .eq("state", state)
      .order("id", { ascending: true })
      .range(offset, offset + VENUE_PAGE_SIZE - 1);
    if (error || !Array.isArray(data)) databaseFailure();
    const page = (data as unknown[]).map(asCandidate);
    if (page.some((row) => row === null)) databaseFailure();
    candidates.push(...page as VenueCandidate[]);
    if (page.length < VENUE_PAGE_SIZE) return { candidates, queryCount };
  }
}

export async function matchPersistedCorralioEvents(admin: SupabaseClient, input: {
  householdId: string;
  sourceId: string;
  sourceEventUids: readonly string[];
  forceRematch?: boolean;
}) {
  const sourceEventUids = [...new Set(input.sourceEventUids.filter(Boolean))];
  if (!sourceEventUids.length) return;

  const [householdResult, eventResults] = await Promise.all([
    admin.from("corralio_households").select("origin_address").eq("id", input.householdId).maybeSingle(),
    Promise.all(batches(sourceEventUids).map((sourceEventUidBatch) => admin
      .from("corralio_events")
      .select("id,source_location_text,display_location_text")
      .eq("household_id", input.householdId)
      .eq("schedule_source_id", input.sourceId)
      .in("source_event_uid", sourceEventUidBatch))),
  ]);
  if (householdResult.error || eventResults.some((result) => result.error || !Array.isArray(result.data))) databaseFailure();
  const events = eventResults.flatMap((result) => result.data as unknown[]).map(asEvent);
  if (events.some((row) => row === null)) databaseFailure();
  if (!events.length) return;
  const eventIds = (events as VenueMatchEvent[]).map((event) => event.id);

  const existingResults = await Promise.all(batches(eventIds).map((eventIdBatch) => admin
    .from("corralio_event_venue_matches")
    .select("event_id,venue_id,match_status,location_fingerprint,matcher_version,recheck_after")
    .in("event_id", eventIdBatch)));
  if (existingResults.some((result) => result.error || !Array.isArray(result.data))) databaseFailure();
  const existingData = existingResults.flatMap((result) => result.data as unknown[]);
  const existing = (existingData as unknown[]).map(asExisting);
  if (existing.some((row) => row === null)) databaseFailure();

  const candidateScopesByState = new Map<string, Promise<{ candidates: VenueCandidate[]; queryCount: number }>>();
  const evaluated = await evaluateVenueMatches({
    householdId: input.householdId,
    originAddress: typeof householdResult.data?.origin_address === "string" ? householdResult.data.origin_address : null,
    events: events as VenueMatchEvent[],
    existing: existing as ExistingVenueMatch[],
    forceRematch: input.forceRematch,
  }, {
    listCandidates(_city, state) {
      const reused = candidateScopesByState.get(state);
      if (reused) return reused.then((scope) => ({ candidates: scope.candidates, queryCount: 0 }));
      const pending = listCompleteCandidateScope(admin, state);
      candidateScopesByState.set(state, pending);
      return pending;
    },
    async currentVenueIds(venueIds) {
      if (!venueIds.length) return new Set<string>();
      const results = await Promise.all(batches(venueIds).map((venueIdBatch) => admin.from("venues_public").select("id").in("id", venueIdBatch)));
      if (results.some((result) => result.error || !Array.isArray(result.data))) databaseFailure();
      return new Set(results.flatMap((result) => result.data as Array<{ id?: unknown }>).flatMap((row) => typeof row.id === "string" ? [row.id] : []));
    },
  });

  if (evaluated.results.length) {
    const { error } = await admin.from("corralio_event_venue_matches").upsert(
      evaluated.results.map((row) => ({
        event_id: row.eventId,
        household_id: input.householdId,
        venue_id: row.venueId,
        match_status: row.matchStatus,
        location_fingerprint: row.locationFingerprint,
        matcher_version: row.matcherVersion,
        evaluated_at: row.evaluatedAt,
        matched_at: row.matchedAt,
        recheck_after: row.recheckAfter,
      })),
      { onConflict: "event_id" },
    );
    if (error) databaseFailure();
  }

  console.info("[corralio][venue-matching] evaluation completed", evaluated.stats);
}
