import {
  estimatedLeaveByIso,
  isValidCoordinates,
  type Coordinates,
  type RouteEstimate,
  type TimedProviderResult,
} from "./leaveBy";
import { resolveRequiredArrival, type RequiredArrivalInput, type RequiredArrivalSource } from "./requiredArrival";

export const TEMPORARY_ORIGIN_GRACE_MS = 24 * 60 * 60 * 1000;
export const TEMPORARY_ORIGIN_CLEANUP_LIMIT = 200;

export type TemporaryOriginKind = "home" | "alternate_address" | "current_location";

export type TemporaryOriginRouteResult =
  | {
      status: "success";
      originKind: "alternate_address" | "current_location";
      estimatedDriveMinutes: number;
    }
  | { status: "busy" | "invalid" | "unavailable" };

export type RoutingEvent = {
  id: string;
  household_id: string;
  schedule_source_id: string | null;
  team_id: string | null;
  starts_at: string;
  ends_at: string | null;
  schedule_arrival_at: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_geocoded_at: string | null;
  source_arrival_minutes: number | null;
  team_arrival_minutes: number | null;
};

export type CurrentLocationRouteDependencies = {
  loadEvent: () => Promise<RoutingEvent | null>;
  claim: () => Promise<boolean>;
  reserve: () => Promise<boolean>;
  route: (event: RoutingEvent) => Promise<TimedProviderResult<RouteEstimate>>;
  release: () => Promise<void>;
  logSkip: (reason: "concurrent_claim_skipped" | "daily_cap_reached") => Promise<void>;
  logResult: (result: TimedProviderResult<RouteEstimate>) => Promise<void>;
};

export function parseCurrentLocationCoordinates(input: unknown): Coordinates | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as { lat?: unknown; lng?: unknown };
  const coordinates = { lat: candidate.lat, lng: candidate.lng };
  return typeof coordinates.lat === "number"
    && typeof coordinates.lng === "number"
    && isValidCoordinates(coordinates as Coordinates)
    ? coordinates as Coordinates
    : null;
}

export function temporaryOriginExpiresAt(input: {
  startsAt: string;
  endsAt: string | null;
}): string | null {
  const boundary = Date.parse(input.endsAt ?? input.startsAt);
  return Number.isFinite(boundary)
    ? new Date(boundary + TEMPORARY_ORIGIN_GRACE_MS).toISOString()
    : null;
}

export function isTemporaryOriginActive(
  input: { startsAt: string; endsAt: string | null },
  nowMs = Date.now(),
): boolean {
  const expiresAt = temporaryOriginExpiresAt(input);
  return expiresAt !== null && Date.parse(expiresAt) > nowMs;
}

export function isAlternateRouteFresh(input: {
  routeComputedAt: string | null;
  originGeocodedAt: string | null;
  locationGeocodedAt: string | null;
}): boolean {
  const computedAt = input.routeComputedAt ? Date.parse(input.routeComputedAt) : Number.NaN;
  const originAt = input.originGeocodedAt ? Date.parse(input.originGeocodedAt) : Number.NaN;
  const destinationAt = input.locationGeocodedAt ? Date.parse(input.locationGeocodedAt) : Number.NaN;
  return Number.isFinite(computedAt)
    && Number.isFinite(originAt)
    && Number.isFinite(destinationAt)
    && computedAt >= originAt
    && computedAt >= destinationAt;
}

export function leaveByForSelectedOrigin(
  arrival: RequiredArrivalInput,
  estimatedDriveMinutes: number,
): { leaveByAt: string; source: RequiredArrivalSource } | null {
  const requiredArrival = resolveRequiredArrival(arrival);
  if (!requiredArrival) return null;
  const leaveByAt = estimatedLeaveByIso(requiredArrival.requiredArrivalAt, estimatedDriveMinutes);
  return leaveByAt ? { leaveByAt, source: requiredArrival.source } : null;
}

export async function routeCurrentLocationWithDependencies(
  origin: Coordinates,
  dependencies: CurrentLocationRouteDependencies,
): Promise<TemporaryOriginRouteResult> {
  if (!isValidCoordinates(origin)) return { status: "invalid" };
  const event = await dependencies.loadEvent();
  if (
    !event
    || typeof event.location_lat !== "number"
    || typeof event.location_lng !== "number"
    || typeof event.location_geocoded_at !== "string"
  ) return { status: "unavailable" };

  if (!await dependencies.claim()) {
    await dependencies.logSkip("concurrent_claim_skipped");
    return { status: "busy" };
  }
  let providerAttemptAuthorized = false;
  try {
    if (!await dependencies.reserve()) {
      await dependencies.logSkip("daily_cap_reached");
      return { status: "unavailable" };
    }
    // Retain the payload-free claim through its short TTL once an external
    // attempt is authorized. This suppresses replayed/double-click requests
    // without retaining the coordinates or route result.
    providerAttemptAuthorized = true;
    const routed = await dependencies.route(event);
    await dependencies.logResult(routed);
    if (routed.kind !== "success") return { status: "unavailable" };
    return {
      status: "success",
      originKind: "current_location",
      estimatedDriveMinutes: routed.value.durationMinutes,
    };
  } finally {
    if (!providerAttemptAuthorized) await dependencies.release();
  }
}
