import "server-only";

import { randomUUID } from "node:crypto";

import {
  geocodeWithGeocodio,
  routeWithOpenRouteService,
  sanitizeOriginAddress,
  skippedAuditRow,
  type Coordinates,
} from "./leaveBy";
import {
  logCorralioExternalRows,
  logCorralioProviderResult,
  requiredServerEnvironment,
  reserveVendorCall,
} from "./leaveBy.server";
import { createCorralioSupabaseAdminClient } from "./supabase/server";
import {
  isAlternateRouteFresh,
  routeCurrentLocationWithDependencies,
  type RoutingEvent,
  type TemporaryOriginRouteResult,
} from "./temporaryOrigin";
import { getWeekendCandidateWindow } from "./weekend";

type AdminClient = ReturnType<typeof createCorralioSupabaseAdminClient>;

type AlternateRow = {
  origin_address: string;
  origin_lat: number | null;
  origin_lng: number | null;
  origin_geocoded_at: string | null;
  origin_geocode_failed_at: string | null;
  origin_geocode_claimed_at: string | null;
  estimated_drive_minutes: number | null;
  route_distance_meters: number | null;
  route_provider: string | null;
  route_computed_at: string | null;
  route_failed_at: string | null;
  route_claimed_at: string | null;
};

const EVENT_ROUTING_SELECT = "id,household_id,schedule_source_id,team_id,starts_at,ends_at,schedule_arrival_at,location_lat,location_lng,location_geocoded_at" as const;
const ALTERNATE_SELECT = "origin_address,origin_lat,origin_lng,origin_geocoded_at,origin_geocode_failed_at,origin_geocode_claimed_at,estimated_drive_minutes,route_distance_meters,route_provider,route_computed_at,route_failed_at,route_claimed_at" as const;

function nowIso() {
  return new Date().toISOString();
}

function staleClaimIso() {
  return new Date(Date.now() - 120_000).toISOString();
}

async function loadAuthorizedRoutingEvent(
  admin: AdminClient,
  householdId: string,
  eventId: string,
): Promise<RoutingEvent | null> {
  const window = getWeekendCandidateWindow(new Date());
  const { data: event } = await admin.from("corralio_events")
    .select(EVENT_ROUTING_SELECT)
    .eq("id", eventId)
    .eq("household_id", householdId)
    .gte("starts_at", window.from)
    .lt("starts_at", window.to)
    .maybeSingle();
  if (!event) return null;

  let sourceArrivalMinutes: number | null = null;
  if (typeof event.schedule_source_id === "string") {
    const { data: source } = await admin.from("corralio_schedule_sources")
      .select("arrival_buffer_minutes,sync_status")
      .eq("id", event.schedule_source_id)
      .eq("household_id", householdId)
      .maybeSingle();
    if (!source || source.sync_status === "disconnected") return null;
    sourceArrivalMinutes = typeof source.arrival_buffer_minutes === "number"
      ? source.arrival_buffer_minutes
      : null;
  }

  let teamArrivalMinutes: number | null = null;
  if (typeof event.team_id === "string") {
    const { data: team } = await admin.from("corralio_teams")
      .select("arrival_buffer_minutes")
      .eq("id", event.team_id)
      .eq("household_id", householdId)
      .is("archived_at", null)
      .maybeSingle();
    teamArrivalMinutes = typeof team?.arrival_buffer_minutes === "number"
      ? team.arrival_buffer_minutes
      : null;
  }

  return {
    ...(event as Omit<RoutingEvent, "source_arrival_minutes" | "team_arrival_minutes">),
    source_arrival_minutes: sourceArrivalMinutes,
    team_arrival_minutes: teamArrivalMinutes,
  };
}

function resultFromDrive(
  originKind: "alternate_address" | "current_location",
  estimatedDriveMinutes: number,
): TemporaryOriginRouteResult {
  return { status: "success", originKind, estimatedDriveMinutes };
}

async function logRoutingSkip(admin: AdminClient, householdId: string, errorCode: "concurrent_claim_skipped" | "daily_cap_reached") {
  await logCorralioExternalRows(admin, [skippedAuditRow({
    householdId,
    api: "openrouteservice",
    operation: "route_event",
    errorCode,
  })]);
}

export async function routeFromCurrentLocation(input: {
  householdId: string;
  eventId: string;
  origin: Coordinates;
}): Promise<TemporaryOriginRouteResult> {
  const admin = createCorralioSupabaseAdminClient();
  const claimToken = randomUUID();
  return routeCurrentLocationWithDependencies(input.origin, {
    loadEvent: () => loadAuthorizedRoutingEvent(admin, input.householdId, input.eventId),
    claim: async () => {
      const { data, error } = await admin.rpc("corralio_claim_current_location_route_v1", {
        p_household_id: input.householdId,
        p_event_id: input.eventId,
        p_claim_token: claimToken,
      });
      return !error && data === true;
    },
    reserve: () => reserveVendorCall(admin, input.householdId),
    route: (event) => routeWithOpenRouteService({
      fetchImpl: fetch,
      apiKey: requiredServerEnvironment("OPENROUTESERVICE_API_KEY"),
      origin: input.origin,
      destination: { lat: event.location_lat as number, lng: event.location_lng as number },
    }),
    release: async () => {
      await admin.rpc("corralio_release_current_location_route_v1", {
        p_household_id: input.householdId,
        p_event_id: input.eventId,
        p_claim_token: claimToken,
      });
    },
    logSkip: (reason) => logRoutingSkip(admin, input.householdId, reason),
    logResult: (result) => logCorralioProviderResult(admin, {
      householdId: input.householdId,
      api: "openrouteservice",
      operation: "route_event",
      result,
    }),
  });
}

async function claimAlternate(
  admin: AdminClient,
  householdId: string,
  eventId: string,
  claimColumn: "origin_geocode_claimed_at" | "route_claimed_at",
) {
  const claimTimestamp = nowIso();
  const attempt = async (availability: "unclaimed" | "stale") => {
    let query = admin.from("corralio_event_routing_origins")
      .update({ [claimColumn]: claimTimestamp })
      .eq("household_id", householdId)
      .eq("event_id", eventId);
    query = availability === "unclaimed"
      ? query.is(claimColumn, null)
      : query.lt(claimColumn, staleClaimIso());
    query = claimColumn === "origin_geocode_claimed_at"
      ? query.is("origin_geocoded_at", null).is("origin_geocode_failed_at", null)
      : query.is("route_computed_at", null).is("route_failed_at", null);
    const { data, error } = await query.select("event_id").maybeSingle();
    return !error && data?.event_id === eventId;
  };
  return await attempt("unclaimed") || await attempt("stale") ? claimTimestamp : null;
}

async function clearAlternateClaim(
  admin: AdminClient,
  householdId: string,
  eventId: string,
  column: "origin_geocode_claimed_at" | "route_claimed_at",
  claimTimestamp: string,
) {
  await admin.from("corralio_event_routing_origins").update({ [column]: null })
    .eq("household_id", householdId)
    .eq("event_id", eventId)
    .eq(column, claimTimestamp);
}

export async function saveAlternateEventOrigin(input: {
  authenticatedClient: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
  householdId: string;
  eventId: string;
  submittedAddress: string;
}): Promise<TemporaryOriginRouteResult> {
  const address = sanitizeOriginAddress(input.submittedAddress);
  if (!address) return { status: "invalid" };
  const admin = createCorralioSupabaseAdminClient();
  const event = await loadAuthorizedRoutingEvent(admin, input.householdId, input.eventId);
  if (!event || typeof event.location_lat !== "number" || typeof event.location_lng !== "number" || !event.location_geocoded_at) {
    return { status: "unavailable" };
  }

  const { data: preparedHouseholdId, error: prepareError } = await input.authenticatedClient.rpc(
    "corralio_prepare_event_routing_origin_v1",
    { p_event_id: input.eventId, p_origin_address: address },
  );
  if (prepareError || preparedHouseholdId !== input.householdId) return { status: "unavailable" };

  const { data: row } = await admin.from("corralio_event_routing_origins")
    .select(ALTERNATE_SELECT)
    .eq("household_id", input.householdId)
    .eq("event_id", input.eventId)
    .maybeSingle();
  if (!row || row.origin_address !== address) return { status: "unavailable" };
  let alternate = row as AlternateRow;

  if (!alternate.origin_geocoded_at) {
    if (alternate.origin_geocode_failed_at) return { status: "unavailable" };
    const claimTimestamp = await claimAlternate(admin, input.householdId, input.eventId, "origin_geocode_claimed_at");
    if (!claimTimestamp) return { status: "busy" };
    if (!await reserveVendorCall(admin, input.householdId)) {
      await clearAlternateClaim(admin, input.householdId, input.eventId, "origin_geocode_claimed_at", claimTimestamp);
      await logCorralioExternalRows(admin, [skippedAuditRow({
        householdId: input.householdId,
        api: "geocodio",
        operation: "geocode_origin",
        errorCode: "daily_cap_reached",
      })]);
      return { status: "unavailable" };
    }
    const geocoded = await geocodeWithGeocodio({
      fetchImpl: fetch,
      apiKey: requiredServerEnvironment("GEOCODIO_API_KEY"),
      address,
    });
    const completedAt = nowIso();
    if (geocoded.kind === "success") {
      await admin.from("corralio_event_routing_origins").update({
        origin_lat: geocoded.value.lat,
        origin_lng: geocoded.value.lng,
        origin_geocoded_at: completedAt,
        origin_geocode_failed_at: null,
        origin_geocode_claimed_at: null,
      }).eq("household_id", input.householdId).eq("event_id", input.eventId)
        .eq("origin_address", address).eq("origin_geocode_claimed_at", claimTimestamp);
    } else if (geocoded.kind === "definitive-failure") {
      await admin.from("corralio_event_routing_origins").update({
        origin_geocode_failed_at: completedAt,
        origin_geocode_claimed_at: null,
      }).eq("household_id", input.householdId).eq("event_id", input.eventId)
        .eq("origin_address", address).eq("origin_geocode_claimed_at", claimTimestamp);
    } else {
      await clearAlternateClaim(admin, input.householdId, input.eventId, "origin_geocode_claimed_at", claimTimestamp);
    }
    await logCorralioProviderResult(admin, {
      householdId: input.householdId,
      api: "geocodio",
      operation: "geocode_origin",
      result: geocoded,
    });
    if (geocoded.kind !== "success") return { status: "unavailable" };
    const refreshed = await admin.from("corralio_event_routing_origins").select(ALTERNATE_SELECT)
      .eq("household_id", input.householdId).eq("event_id", input.eventId).maybeSingle();
    alternate = refreshed.data as AlternateRow;
  }

  if (
    alternate.estimated_drive_minutes !== null
    && isAlternateRouteFresh({
      routeComputedAt: alternate.route_computed_at,
      originGeocodedAt: alternate.origin_geocoded_at,
      locationGeocodedAt: event.location_geocoded_at,
    })
  ) return resultFromDrive("alternate_address", alternate.estimated_drive_minutes);

  await admin.from("corralio_event_routing_origins").update({
    estimated_drive_minutes: null,
    route_distance_meters: null,
    route_provider: null,
    route_computed_at: null,
    route_failed_at: null,
  }).eq("household_id", input.householdId).eq("event_id", input.eventId);
  const routeClaim = await claimAlternate(admin, input.householdId, input.eventId, "route_claimed_at");
  if (!routeClaim) return { status: "busy" };
  if (!await reserveVendorCall(admin, input.householdId)) {
    await clearAlternateClaim(admin, input.householdId, input.eventId, "route_claimed_at", routeClaim);
    await logRoutingSkip(admin, input.householdId, "daily_cap_reached");
    return { status: "unavailable" };
  }
  const routed = await routeWithOpenRouteService({
    fetchImpl: fetch,
    apiKey: requiredServerEnvironment("OPENROUTESERVICE_API_KEY"),
    origin: { lat: alternate.origin_lat as number, lng: alternate.origin_lng as number },
    destination: { lat: event.location_lat, lng: event.location_lng },
  });
  const routedAt = nowIso();
  if (routed.kind === "success") {
    await admin.from("corralio_event_routing_origins").update({
      estimated_drive_minutes: routed.value.durationMinutes,
      route_distance_meters: routed.value.distanceMeters,
      route_provider: "openrouteservice",
      route_computed_at: routedAt,
      route_failed_at: null,
      route_claimed_at: null,
    }).eq("household_id", input.householdId).eq("event_id", input.eventId)
      .eq("route_claimed_at", routeClaim);
  } else if (routed.kind === "definitive-failure") {
    await admin.from("corralio_event_routing_origins").update({
      route_failed_at: routedAt,
      route_claimed_at: null,
    }).eq("household_id", input.householdId).eq("event_id", input.eventId)
      .eq("route_claimed_at", routeClaim);
  } else {
    await clearAlternateClaim(admin, input.householdId, input.eventId, "route_claimed_at", routeClaim);
  }
  await logCorralioProviderResult(admin, {
    householdId: input.householdId,
    api: "openrouteservice",
    operation: "route_event",
    result: routed,
  });
  return routed.kind === "success"
    ? resultFromDrive("alternate_address", routed.value.durationMinutes)
    : { status: "unavailable" };
}

export async function cleanupExpiredTemporaryOrigins(limit: number) {
  const admin = createCorralioSupabaseAdminClient();
  const { data, error } = await admin.rpc("corralio_cleanup_event_routing_origins_v1", {
    p_limit: limit,
  });
  if (error) throw new Error("temporary origin cleanup failed");
  const result = Array.isArray(data) ? data[0] : data;
  return {
    overridesDeleted: typeof result?.overrides_deleted === "number" ? result.overrides_deleted : 0,
    claimsDeleted: typeof result?.claims_deleted === "number" ? result.claims_deleted : 0,
  };
}
