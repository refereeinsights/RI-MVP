export const LEAVE_BY_ARRIVAL_BUFFER_MINUTES = 30;
export const EVENT_GEOCODE_CAP_PER_MOUNT = 10;
export const MAX_ROUTES_PER_MOUNT = 10;
export const CORRALIO_DAILY_EXTERNAL_CALL_CAP_PER_HOUSEHOLD = 50;
export const GEOCODIO_MINIMUM_ACCURACY = 0.8;
export const GEOCODIO_ALLOWED_ACCURACY_TYPES = [
  "rooftop",
  "point",
  "range_interpolation",
] as const;

export type ExternalApiName = "geocodio" | "openrouteservice";
export type ExternalOperation = "geocode_origin" | "geocode_event" | "route_event";
export type ExternalErrorCode =
  | "no_results"
  | "low_accuracy"
  | "invalid_result"
  | "rate_limited"
  | "timeout"
  | "provider_error"
  | "no_route_found"
  | "household_result_reused"
  | "batch_duplicate_skipped"
  | "concurrent_claim_skipped"
  | "daily_cap_reached";

export type ProviderResult<T> =
  | { kind: "success"; value: T }
  | { kind: "retryable-failure"; errorCode: ExternalErrorCode }
  | { kind: "definitive-failure"; errorCode: ExternalErrorCode };

export type Coordinates = { lat: number; lng: number };
export type RouteEstimate = { durationMinutes: number; distanceMeters: number };
export type TimedProviderResult<T> = ProviderResult<T> & { latencyMs: number };
export type VendorCallSlot = "acquired" | "claim-skipped" | "daily-cap-reached";

export type ExternalApiAuditRow = {
  household_id: string;
  api: ExternalApiName;
  operation: ExternalOperation;
  status: "ok" | "error" | "skipped";
  error_code: ExternalErrorCode | null;
  retryable: boolean | null;
  billable: boolean;
  latency_ms: number | null;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeLocationText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
  return normalized || null;
}

export function sanitizeOriginAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const address = value.trim().replace(/\s+/g, " ");
  return address.length >= 1 && address.length <= 100 ? address : null;
}

export function isValidCoordinates(coordinates: Coordinates): boolean {
  return Number.isFinite(coordinates.lat)
    && Number.isFinite(coordinates.lng)
    && coordinates.lat >= -90
    && coordinates.lat <= 90
    && coordinates.lng >= -180
    && coordinates.lng <= 180;
}

function httpFailure(status: number): ProviderResult<never> | null {
  if (status === 429) return { kind: "retryable-failure", errorCode: "rate_limited" };
  if (status >= 500 || status <= 0) {
    return { kind: "retryable-failure", errorCode: "provider_error" };
  }
  return null;
}

export function parseGeocodioResponse(status: number, payload: unknown): ProviderResult<Coordinates> {
  const transient = httpFailure(status);
  if (transient) return transient;
  if (status < 200 || status >= 300) {
    return { kind: "definitive-failure", errorCode: "invalid_result" };
  }
  if (!payload || typeof payload !== "object") {
    return { kind: "retryable-failure", errorCode: "provider_error" };
  }

  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return { kind: "retryable-failure", errorCode: "provider_error" };
  }
  if (results.length === 0) {
    return { kind: "definitive-failure", errorCode: "no_results" };
  }

  const first = results[0];
  if (!first || typeof first !== "object") {
    return { kind: "retryable-failure", errorCode: "provider_error" };
  }
  const result = first as {
    accuracy?: unknown;
    accuracy_type?: unknown;
    location?: { lat?: unknown; lng?: unknown };
    address_components?: { country?: unknown };
  };
  const accuracy = finiteNumber(result.accuracy);
  const accuracyType = typeof result.accuracy_type === "string" ? result.accuracy_type : null;
  if (accuracy === null || accuracyType === null || !result.location || !result.address_components) {
    return { kind: "retryable-failure", errorCode: "provider_error" };
  }
  if (
    accuracy < GEOCODIO_MINIMUM_ACCURACY
    || !GEOCODIO_ALLOWED_ACCURACY_TYPES.includes(
      accuracyType as (typeof GEOCODIO_ALLOWED_ACCURACY_TYPES)[number],
    )
  ) {
    return { kind: "definitive-failure", errorCode: "low_accuracy" };
  }

  const country = typeof result.address_components.country === "string"
    ? result.address_components.country.trim().toUpperCase()
    : null;
  const coordinates = {
    lat: finiteNumber(result.location.lat) ?? Number.NaN,
    lng: finiteNumber(result.location.lng) ?? Number.NaN,
  };
  if (country !== "US" || !isValidCoordinates(coordinates)) {
    return { kind: "definitive-failure", errorCode: "invalid_result" };
  }
  return { kind: "success", value: coordinates };
}

export function parseOpenRouteServiceResponse(
  status: number,
  payload: unknown,
): ProviderResult<RouteEstimate> {
  const transient = httpFailure(status);
  if (transient) return transient;
  if (status === 404) {
    return { kind: "definitive-failure", errorCode: "no_route_found" };
  }
  if (status < 200 || status >= 300) {
    return { kind: "definitive-failure", errorCode: "invalid_result" };
  }
  if (!payload || typeof payload !== "object") {
    return { kind: "retryable-failure", errorCode: "provider_error" };
  }
  const routes = (payload as { routes?: unknown }).routes;
  if (!Array.isArray(routes)) {
    return { kind: "retryable-failure", errorCode: "provider_error" };
  }
  if (routes.length === 0) {
    return { kind: "definitive-failure", errorCode: "no_route_found" };
  }
  const first = routes[0];
  if (!first || typeof first !== "object") {
    return { kind: "retryable-failure", errorCode: "provider_error" };
  }
  const summary = (first as { summary?: unknown }).summary;
  if (!summary || typeof summary !== "object") {
    return { kind: "retryable-failure", errorCode: "provider_error" };
  }
  const durationSeconds = finiteNumber((summary as { duration?: unknown }).duration);
  const distanceMeters = finiteNumber((summary as { distance?: unknown }).distance);
  if (durationSeconds === null || distanceMeters === null) {
    return { kind: "retryable-failure", errorCode: "provider_error" };
  }

  const durationMinutes = Math.round(durationSeconds / 60);
  const roundedDistanceMeters = Math.round(distanceMeters);
  if (
    durationMinutes < 1
    || durationMinutes > 720
    || roundedDistanceMeters <= 0
  ) {
    return { kind: "retryable-failure", errorCode: "provider_error" };
  }
  return {
    kind: "success",
    value: { durationMinutes, distanceMeters: roundedDistanceMeters },
  };
}

async function readProviderJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function timedFailure(error: unknown, startedAt: number): TimedProviderResult<never> {
  const errorCode = error instanceof Error && error.name === "AbortError"
    ? "timeout"
    : "provider_error";
  return {
    kind: "retryable-failure",
    errorCode,
    latencyMs: Math.max(0, Date.now() - startedAt),
  };
}

export async function geocodeWithGeocodio(input: {
  fetchImpl: FetchLike;
  apiKey: string;
  address: string;
  timeoutMs?: number;
}): Promise<TimedProviderResult<Coordinates>> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 8_000);
  try {
    const url = new URL("https://api.geocod.io/v2/geocode");
    url.searchParams.set("q", input.address);
    // Geocodio's request vocabulary uses USA; successful responses use US.
    url.searchParams.set("country", "USA");
    url.searchParams.set("api_key", input.apiKey);
    const response = await input.fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const parsed = parseGeocodioResponse(response.status, await readProviderJson(response));
    return { ...parsed, latencyMs: Math.max(0, Date.now() - startedAt) };
  } catch (error) {
    return timedFailure(error, startedAt);
  } finally {
    clearTimeout(timeout);
  }
}

export async function routeWithOpenRouteService(input: {
  fetchImpl: FetchLike;
  apiKey: string;
  origin: Coordinates;
  destination: Coordinates;
  timeoutMs?: number;
}): Promise<TimedProviderResult<RouteEstimate>> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 8_000);
  try {
    const response = await input.fetchImpl(
      "https://api.heigit.org/openrouteservice/v2/directions/driving-car/json",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: input.apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          coordinates: [
            [input.origin.lng, input.origin.lat],
            [input.destination.lng, input.destination.lat],
          ],
          instructions: false,
        }),
        cache: "no-store",
        signal: controller.signal,
      },
    );
    const parsed = parseOpenRouteServiceResponse(
      response.status,
      await readProviderJson(response),
    );
    return { ...parsed, latencyMs: Math.max(0, Date.now() - startedAt) };
  } catch (error) {
    return timedFailure(error, startedAt);
  } finally {
    clearTimeout(timeout);
  }
}

export function estimatedLeaveByIso(
  startsAt: string,
  estimatedDriveMinutes: number,
  arrivalBufferMinutes = LEAVE_BY_ARRIVAL_BUFFER_MINUTES,
): string | null {
  const startsAtMs = Date.parse(startsAt);
  if (
    !Number.isFinite(startsAtMs)
    || !Number.isInteger(estimatedDriveMinutes)
    || estimatedDriveMinutes < 1
    || !Number.isInteger(arrivalBufferMinutes)
    || arrivalBufferMinutes < 0
  ) return null;
  return new Date(
    startsAtMs - (estimatedDriveMinutes + arrivalBufferMinutes) * 60_000,
  ).toISOString();
}

export function isRouteFresh(input: {
  leaveByComputedAt: string | null;
  originGeocodedAt: string | null;
  locationGeocodedAt: string | null;
}): boolean {
  const computedAt = input.leaveByComputedAt ? Date.parse(input.leaveByComputedAt) : Number.NaN;
  const originAt = input.originGeocodedAt ? Date.parse(input.originGeocodedAt) : Number.NaN;
  const locationAt = input.locationGeocodedAt ? Date.parse(input.locationGeocodedAt) : Number.NaN;
  return Number.isFinite(computedAt)
    && Number.isFinite(originAt)
    && Number.isFinite(locationAt)
    && computedAt >= originAt
    && computedAt >= locationAt;
}

export function groupByNormalizedLocation<T extends { id: string; locationNormalized: string | null }>(
  rows: readonly T[],
): Array<{ normalized: string; representative: T; rows: T[] }> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.locationNormalized) continue;
    const group = groups.get(row.locationNormalized) ?? [];
    group.push(row);
    groups.set(row.locationNormalized, group);
  }
  return Array.from(groups, ([normalized, groupRows]) => {
    const sorted = [...groupRows].sort((left, right) => left.id.localeCompare(right.id));
    return { normalized, representative: sorted[0] as T, rows: sorted };
  }).sort((left, right) => left.representative.id.localeCompare(right.representative.id));
}

export function applyMountCap<T>(rows: readonly T[], cap: number): T[] {
  if (!Number.isInteger(cap) || cap < 0) return [];
  return rows.slice(0, cap);
}

export function providerAuditRow(input: {
  householdId: string;
  api: ExternalApiName;
  operation: ExternalOperation;
  result: { kind: string; errorCode?: ExternalErrorCode; latencyMs: number };
}): ExternalApiAuditRow {
  const success = input.result.kind === "success";
  return {
    household_id: input.householdId,
    api: input.api,
    operation: input.operation,
    status: success ? "ok" : "error",
    error_code: success ? null : input.result.errorCode ?? "provider_error",
    retryable: success ? null : input.result.kind === "retryable-failure",
    billable: true,
    latency_ms: input.result.latencyMs,
  };
}

export function skippedAuditRow(input: {
  householdId: string;
  api: ExternalApiName;
  operation: ExternalOperation;
  errorCode: Extract<ExternalErrorCode,
    "household_result_reused" | "batch_duplicate_skipped" | "concurrent_claim_skipped" | "daily_cap_reached">;
}): ExternalApiAuditRow {
  return {
    household_id: input.householdId,
    api: input.api,
    operation: input.operation,
    status: "skipped",
    error_code: input.errorCode,
    retryable: null,
    billable: false,
    latency_ms: null,
  };
}

export async function acquireVendorCallSlot(input: {
  claim: () => Promise<boolean>;
  reserve: () => Promise<boolean>;
  releaseClaim: () => Promise<void>;
}): Promise<VendorCallSlot> {
  if (!await input.claim()) return "claim-skipped";
  if (await input.reserve()) return "acquired";
  await input.releaseClaim();
  return "daily-cap-reached";
}
