import "server-only";

import {
  logCorralioProviderResult,
  requiredServerEnvironment,
  reserveVendorCall,
} from "./leaveBy.server";
import { routeWithOpenRouteService, type Coordinates, type RouteEstimate } from "./leaveBy";
import type { OvertureFoodTag, OvertureIntentCategory } from "./overtureNearby";
import { createCorralioSupabaseAdminClient } from "./supabase/server";
import {
  prefilterWhatFitsCandidates,
  qualifyAndRankWhatFitsCandidates,
  selectWhatFitsGap,
  WHAT_FITS_MAX_ROUTE_CALLS_PER_GAP,
  WHAT_FITS_ROUTE_CONCURRENCY,
  WHAT_FITS_ROUTED_CANDIDATES_PER_MODE,
  type WhatFitsCandidateInput,
  type WhatFitsCandidateRoutes,
  type WhatFitsMode,
  type WhatFitsRecommendation,
  type WhatFitsSuppressionReason,
} from "./whatFits";

type AdminClient = ReturnType<typeof createCorralioSupabaseAdminClient>;

type EventRow = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  team_id: string | null;
  schedule_arrival_at: string | null;
  location_lat: number | null;
  location_lng: number | null;
};

type CandidateRow = {
  id: string;
  category: WhatFitsMode;
  intent_category: OvertureIntentCategory;
  operating_status: "confirmed_open" | "confirmed_closed" | "status_unknown";
  active: boolean;
  quality_rule_version: string;
  dedupe_rule_version: string;
  distance_meters: number;
  overture_existence_confidence: number;
  name: string;
  latitude: number;
  longitude: number;
};

export type WhatFitsClientRecommendation = Omit<
  WhatFitsRecommendation,
  "active" | "qualityRuleVersion" | "dedupeRuleVersion" | "existenceConfidence" | "latitude" | "longitude"
> & { navigationQuery: string };

export type WhatFitsServerResult =
  | { kind: "suppressed"; reason: WhatFitsSuppressionReason }
  | {
      kind: "ready";
      mode: WhatFitsMode;
      currentEventId: string;
      nextEventId: string;
      gapStartsAt: string;
      requiredArrivalAt: string;
      rawGapMinutes: number;
      nextEventTimezone: string | null;
      arrivalSource: "ics_explicit" | "team_preference" | "corralio_default";
      arrivalMinutes: number;
      recommendations: WhatFitsClientRecommendation[];
    };

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function resolveCandidateTarget(admin: AdminClient, eventId: string) {
  const { data: match, error } = await admin.from("corralio_event_venue_matches")
    .select("match_status,venue_id,provisional_venue_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error || !match) return null;
  if (match.match_status === "matched" && typeof match.venue_id === "string") {
    return { type: "canonical" as const, id: match.venue_id };
  }
  if (match.match_status !== "provisional" || typeof match.provisional_venue_id !== "string") return null;
  const { data, error: resolverError } = await admin.rpc("corralio_resolve_provisional_enrichment_target_v1", {
    p_provisional_venue_id: match.provisional_venue_id,
  }).maybeSingle();
  const resolved = data as { target_type?: unknown; target_id?: unknown } | null;
  if (resolverError || !resolved || (resolved.target_type !== "canonical" && resolved.target_type !== "provisional") || typeof resolved.target_id !== "string") {
    return null;
  }
  return { type: resolved.target_type as "canonical" | "provisional", id: resolved.target_id };
}

async function loadCandidates(admin: AdminClient, target: { type: "canonical" | "provisional"; id: string }, mode: WhatFitsMode) {
  let query = admin.from("corralio_overture_candidates")
    .select("id,category,intent_category,operating_status,active,quality_rule_version,dedupe_rule_version,distance_meters,overture_existence_confidence,name,latitude,longitude")
    .eq("active", true)
    .eq("category", mode);
  query = target.type === "canonical"
    ? query.eq("canonical_venue_id", target.id)
    : query.eq("provisional_venue_id", target.id);
  const { data, error } = await query.order("distance_meters", { ascending: true }).limit(15);
  if (error) return null;
  const rows = (data ?? []) as CandidateRow[];
  if (!rows.length) {
    let scopeQuery = admin.from("corralio_overture_refresh_scopes")
      .select("refresh_id")
      .eq("category", mode);
    scopeQuery = target.type === "canonical"
      ? scopeQuery.eq("canonical_venue_id", target.id)
      : scopeQuery.eq("provisional_venue_id", target.id);
    const { data: scopes, error: scopeError } = await scopeQuery.limit(20);
    if (scopeError || !scopes?.length) return null;
    const refreshIds = [...new Set(scopes.flatMap((scope) => typeof scope.refresh_id === "string" ? [scope.refresh_id] : []))];
    if (!refreshIds.length) return null;
    const { data: activeRefreshes, error: refreshError } = await admin.from("corralio_overture_refreshes")
      .select("id")
      .in("id", refreshIds)
      .eq("status", "active")
      .limit(1);
    if (refreshError || !activeRefreshes?.length) return null;
    return [];
  }
  const { data: tagRows } = await admin.from("corralio_overture_candidate_food_tags")
    .select("candidate_id,food_tag")
    .in("candidate_id", rows.map((row) => row.id));
  const tags = new Map<string, OvertureFoodTag[]>();
  for (const row of tagRows ?? []) {
    if (typeof row.candidate_id !== "string" || typeof row.food_tag !== "string") continue;
    const current = tags.get(row.candidate_id) ?? [];
    current.push(row.food_tag as OvertureFoodTag);
    tags.set(row.candidate_id, current);
  }
  return rows.map((row): WhatFitsCandidateInput => ({
    id: row.id,
    mode: row.category,
    intentCategory: row.intent_category,
    operatingStatus: row.operating_status,
    active: row.active,
    qualityRuleVersion: row.quality_rule_version,
    dedupeRuleVersion: row.dedupe_rule_version,
    distanceMeters: row.distance_meters,
    existenceConfidence: row.overture_existence_confidence,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    foodTags: tags.get(row.id) ?? [],
  }));
}

type Leg = { key: string; origin: Coordinates; destination: Coordinates };

async function routeLegs(admin: AdminClient, householdId: string, legs: readonly Leg[]) {
  const unique = new Map(legs.slice(0, WHAT_FITS_MAX_ROUTE_CALLS_PER_GAP).map((leg) => [leg.key, leg]));
  const queue = [...unique.values()];
  const routes = new Map<string, RouteEstimate>();
  let quotaExhausted = false;
  let cursor = 0;
  const apiKey = requiredServerEnvironment("OPENROUTESERVICE_API_KEY");
  const workers = Array.from({ length: Math.min(WHAT_FITS_ROUTE_CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const leg = queue[index];
      if (!leg) return;
      if (!await reserveVendorCall(admin, householdId)) {
        quotaExhausted = true;
        continue;
      }
      const result = await routeWithOpenRouteService({
        fetchImpl: fetch,
        apiKey,
        origin: leg.origin,
        destination: leg.destination,
      });
      await logCorralioProviderResult(admin, {
        householdId,
        api: "openrouteservice",
        operation: "route_what_fits",
        result,
      });
      if (result.kind === "success") routes.set(leg.key, result.value);
    }
  });
  await Promise.all(workers);
  return { routes, quotaExhausted, attempted: queue.length };
}

function legKey(origin: Coordinates, destination: Coordinates) {
  return `${origin.lat},${origin.lng}>${destination.lat},${destination.lng}`;
}

export async function computeWhatFits(input: {
  householdId: string;
  eventIds: readonly string[];
  mode: WhatFitsMode;
  candidateLimitReached: boolean;
}): Promise<WhatFitsServerResult> {
  const admin = createCorralioSupabaseAdminClient();
  const { data, error } = await admin.from("corralio_events")
    .select("id,starts_at,ends_at,timezone,team_id,schedule_arrival_at,location_lat,location_lng")
    .eq("household_id", input.householdId)
    .in("id", input.eventIds.slice(0, 200))
    .order("starts_at", { ascending: true });
  if (error) return { kind: "suppressed", reason: "missing_venue" };
  const rows = (data ?? []) as EventRow[];
  const teamIds = [...new Set(rows.flatMap((row) => row.team_id ? [row.team_id] : []))];
  const { data: teamRows } = teamIds.length
    ? await admin.from("corralio_teams").select("id,arrival_buffer_minutes").eq("household_id", input.householdId).in("id", teamIds)
    : { data: [] as Array<{ id: string; arrival_buffer_minutes: number | null }> };
  const teamArrival = new Map((teamRows ?? []).map((team) => [team.id, team.arrival_buffer_minutes]));
  const gapResult = selectWhatFitsGap(rows.map((row) => ({
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    teamId: row.team_id,
    scheduleArrivalAt: row.schedule_arrival_at,
    teamArrivalMinutes: row.team_id ? teamArrival.get(row.team_id) ?? null : null,
    latitude: row.location_lat,
    longitude: row.location_lng,
  })), input.candidateLimitReached);
  if (gapResult.kind === "suppressed") return gapResult;

  const target = await resolveCandidateTarget(admin, gapResult.gap.currentEvent.id);
  if (!target) return { kind: "suppressed", reason: "missing_venue" };
  const pool = await loadCandidates(admin, target, input.mode);
  if (pool === null) return { kind: "suppressed", reason: "no_candidate_pool" };
  const candidates = prefilterWhatFitsCandidates(pool, input.mode, WHAT_FITS_ROUTED_CANDIDATES_PER_MODE);
  if (!candidates.length) {
    return {
      kind: "ready",
      mode: input.mode,
      currentEventId: gapResult.gap.currentEvent.id,
      nextEventId: gapResult.gap.nextEvent.id,
      gapStartsAt: gapResult.gap.gapStartsAt,
      requiredArrivalAt: gapResult.gap.requiredArrivalAt,
      rawGapMinutes: gapResult.gap.rawGapMinutes,
      nextEventTimezone: gapResult.gap.nextEvent.timezone,
      arrivalSource: gapResult.gap.arrivalSource,
      arrivalMinutes: gapResult.gap.arrivalMinutes,
      recommendations: [],
    };
  }

  const current = { lat: gapResult.gap.currentEvent.latitude as number, lng: gapResult.gap.currentEvent.longitude as number };
  const next = { lat: gapResult.gap.nextEvent.latitude as number, lng: gapResult.gap.nextEvent.longitude as number };
  const legs = candidates.flatMap((candidate) => {
    const destination = { lat: candidate.latitude, lng: candidate.longitude };
    return [
      { key: legKey(current, destination), origin: current, destination },
      { key: legKey(destination, next), origin: destination, destination: next },
    ];
  });
  const routed = await routeLegs(admin, input.householdId, legs);
  const candidateRoutes = new Map<string, WhatFitsCandidateRoutes>();
  for (const candidate of candidates) {
    const coordinate = { lat: candidate.latitude, lng: candidate.longitude };
    const outbound = routed.routes.get(legKey(current, coordinate));
    const inbound = routed.routes.get(legKey(coordinate, next));
    if (!outbound || !inbound) continue;
    candidateRoutes.set(candidate.id, {
      outboundMinutes: outbound.durationMinutes,
      outboundDistanceMeters: outbound.distanceMeters,
      inboundMinutes: inbound.durationMinutes,
      inboundDistanceMeters: inbound.distanceMeters,
    });
  }
  if (!candidateRoutes.size && routed.attempted > 0) {
    return { kind: "suppressed", reason: routed.quotaExhausted ? "quota_exhausted" : "routing_unavailable" };
  }
  const recommendations = qualifyAndRankWhatFitsCandidates(gapResult.gap, candidates, candidateRoutes);
  return {
    kind: "ready",
    mode: input.mode,
    currentEventId: gapResult.gap.currentEvent.id,
    nextEventId: gapResult.gap.nextEvent.id,
    gapStartsAt: gapResult.gap.gapStartsAt,
    requiredArrivalAt: gapResult.gap.requiredArrivalAt,
    rawGapMinutes: gapResult.gap.rawGapMinutes,
    nextEventTimezone: gapResult.gap.nextEvent.timezone,
    arrivalSource: gapResult.gap.arrivalSource,
    arrivalMinutes: gapResult.gap.arrivalMinutes,
    recommendations: recommendations.map((recommendation) => ({
      id: recommendation.id,
      mode: recommendation.mode,
      intentCategory: recommendation.intentCategory,
      operatingStatus: recommendation.operatingStatus,
      distanceMeters: recommendation.distanceMeters,
      name: recommendation.name,
      foodTags: recommendation.foodTags,
      outboundMinutes: recommendation.outboundMinutes,
      outboundDistanceMeters: recommendation.outboundDistanceMeters,
      inboundMinutes: recommendation.inboundMinutes,
      inboundDistanceMeters: recommendation.inboundDistanceMeters,
      dwellMinutes: recommendation.dwellMinutes,
      fitMarginMinutes: recommendation.fitMarginMinutes,
      leaveCandidateAt: recommendation.leaveCandidateAt,
      totalDriveMinutes: recommendation.totalDriveMinutes,
      navigationQuery: `${recommendation.latitude},${recommendation.longitude}`,
    })),
  };
}

export function hasUsableWhatFitsCoordinates(input: { latitude: unknown; longitude: unknown }) {
  return isCoordinate(input.latitude) && isCoordinate(input.longitude);
}
