import assert from "node:assert/strict";
import test from "node:test";

import {
  acquireVendorCallSlot,
  applyMountCap,
  EVENT_GEOCODE_CAP_PER_MOUNT,
  estimatedLeaveByIso,
  geocodeWithGeocodio,
  groupByNormalizedLocation,
  isRouteFresh,
  normalizeLocationText,
  parseGeocodioResponse,
  parseOpenRouteServiceResponse,
  providerAuditRow,
  routeWithOpenRouteService,
  sanitizeOriginAddress,
  skippedAuditRow,
} from "./leaveBy";

test("normalizes location text and bounds private origins", () => {
  assert.equal(normalizeLocationText("  Starfire   Sports  "), "starfire sports");
  assert.equal(normalizeLocationText("\n\t"), null);
  assert.equal(sanitizeOriginAddress("  123  Main St  "), "123 Main St");
  assert.equal(sanitizeOriginAddress("x".repeat(101)), null);
});

test("accepts Geocodio only when score, type, coordinates, and country all pass", () => {
  const response = (accuracy: number, accuracyType: string, country = "US") => ({
    results: [{
      accuracy,
      accuracy_type: accuracyType,
      location: { lat: 47.5, lng: -122.2 },
      address_components: { country },
    }],
  });

  assert.deepEqual(parseGeocodioResponse(200, response(0.9, "rooftop")), {
    kind: "success",
    value: { lat: 47.5, lng: -122.2 },
  });
  assert.equal(parseGeocodioResponse(200, response(0.79, "rooftop")).kind, "definitive-failure");
  assert.equal(parseGeocodioResponse(200, response(1, "place")).kind, "definitive-failure");
  assert.equal(parseGeocodioResponse(200, response(1, "rooftop", "CA")).kind, "definitive-failure");
});

test("distinguishes definitive Geocodio results from retryable provider failures", () => {
  assert.deepEqual(parseGeocodioResponse(200, { results: [] }), {
    kind: "definitive-failure",
    errorCode: "no_results",
  });
  assert.deepEqual(parseGeocodioResponse(200, { unexpected: true }), {
    kind: "retryable-failure",
    errorCode: "provider_error",
  });
  assert.deepEqual(parseGeocodioResponse(429, {}), {
    kind: "retryable-failure",
    errorCode: "rate_limited",
  });
  assert.equal(parseGeocodioResponse(503, {}).kind, "retryable-failure");
});

test("parses and rounds the OpenRouteService JSON summary", () => {
  assert.deepEqual(parseOpenRouteServiceResponse(200, {
    routes: [{ summary: { duration: 3131.8, distance: 42123.6 } }],
  }), {
    kind: "success",
    value: { durationMinutes: 52, distanceMeters: 42124 },
  });
  assert.deepEqual(parseOpenRouteServiceResponse(200, { routes: [] }), {
    kind: "definitive-failure",
    errorCode: "no_route_found",
  });
  assert.equal(parseOpenRouteServiceResponse(200, { routes: [{}] }).kind, "retryable-failure");
  assert.equal(parseOpenRouteServiceResponse(429, {}).kind, "retryable-failure");
});

test("isolates Geocodio HTTP request handling behind injected fetch", async () => {
  let requestedUrl = "";
  const result = await geocodeWithGeocodio({
    apiKey: "test-key",
    address: "Public landmark",
    fetchImpl: async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        results: [{
          accuracy: 1,
          accuracy_type: "rooftop",
          location: { lat: 47.5, lng: -122.2 },
          address_components: { country: "US" },
        }],
      }), { status: 200 });
    },
  });
  assert.equal(result.kind, "success");
  assert.match(requestedUrl, /^https:\/\/api\.geocod\.io\/v2\/geocode\?/);
  assert.match(requestedUrl, /country=US/);
});

test("isolates ORS HTTP request and uses longitude-latitude coordinate order", async () => {
  let body = "";
  const result = await routeWithOpenRouteService({
    apiKey: "test-key",
    origin: { lat: 47.5, lng: -122.2 },
    destination: { lat: 47.6, lng: -122.3 },
    fetchImpl: async (input, init) => {
      assert.equal(
        String(input),
        "https://api.heigit.org/openrouteservice/v2/directions/driving-car/json",
      );
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({
        routes: [{ summary: { duration: 600, distance: 10000 } }],
      }), { status: 200 });
    },
  });
  assert.equal(result.kind, "success");
  assert.deepEqual(JSON.parse(body).coordinates, [[-122.2, 47.5], [-122.3, 47.6]]);
});

test("computes leave-by from the absolute start instant and configured buffer", () => {
  assert.equal(
    estimatedLeaveByIso("2026-09-05T16:00:00.000Z", 52),
    "2026-09-05T14:38:00.000Z",
  );
  assert.equal(estimatedLeaveByIso("invalid", 52), null);
});

test("requires a cached route to be fresh against both geocode endpoints", () => {
  assert.equal(isRouteFresh({
    leaveByComputedAt: "2026-08-25T10:00:00Z",
    originGeocodedAt: "2026-08-25T09:00:00Z",
    locationGeocodedAt: "2026-08-25T09:30:00Z",
  }), true);
  assert.equal(isRouteFresh({
    leaveByComputedAt: "2026-08-25T10:00:00Z",
    originGeocodedAt: "2026-08-25T10:01:00Z",
    locationGeocodedAt: "2026-08-25T09:30:00Z",
  }), false);
});

test("groups normalized locations with one deterministic representative", () => {
  const groups = groupByNormalizedLocation([
    { id: "b", locationNormalized: "same" },
    { id: "a", locationNormalized: "same" },
    { id: "c", locationNormalized: "other" },
  ]);
  assert.deepEqual(groups.map((group) => [group.normalized, group.representative.id]), [
    ["same", "a"],
    ["other", "c"],
  ]);
});

test("applies the geocode and route mount caps after deterministic grouping", () => {
  const groups = groupByNormalizedLocation(Array.from({ length: 14 }, (_, index) => ({
    id: String(index).padStart(2, "0"),
    locationNormalized: `location-${index}`,
  })));
  assert.equal(applyMountCap(groups, EVENT_GEOCODE_CAP_PER_MOUNT).length, 10);
  assert.equal(applyMountCap(groups, 10).at(-1)?.representative.id, "09");
  assert.equal(applyMountCap(groups, -1).length, 0);
});

test("builds constraint-safe payload-free provider and skip audit rows", () => {
  assert.deepEqual(providerAuditRow({
    householdId: "household",
    api: "geocodio",
    operation: "geocode_event",
    result: { kind: "success", latencyMs: 12 },
  }), {
    household_id: "household",
    api: "geocodio",
    operation: "geocode_event",
    status: "ok",
    error_code: null,
    retryable: null,
    billable: true,
    latency_ms: 12,
  });
  assert.equal(providerAuditRow({
    householdId: "household",
    api: "openrouteservice",
    operation: "route_event",
    result: { kind: "retryable-failure", errorCode: "timeout", latencyMs: 8_000 },
  }).retryable, true);
  assert.equal(providerAuditRow({
    householdId: "household",
    api: "openrouteservice",
    operation: "route_event",
    result: { kind: "definitive-failure", errorCode: "no_route_found", latencyMs: 20 },
  }).retryable, false);
  assert.deepEqual(skippedAuditRow({
    householdId: "household",
    api: "geocodio",
    operation: "geocode_event",
    errorCode: "daily_cap_reached",
  }), {
    household_id: "household",
    api: "geocodio",
    operation: "geocode_event",
    status: "skipped",
    error_code: "daily_cap_reached",
    retryable: null,
    billable: false,
    latency_ms: null,
  });
});

test("claims before reserving and allows only one concurrent worker to proceed", async () => {
  let claimed = false;
  let reservations = 0;
  const slot = () => acquireVendorCallSlot({
    claim: async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    reserve: async () => {
      reservations += 1;
      return true;
    },
    releaseClaim: async () => {
      claimed = false;
    },
  });
  const [first, second] = await Promise.all([slot(), slot()]);
  assert.deepEqual([first, second].sort(), ["acquired", "claim-skipped"]);
  assert.equal(reservations, 1);
});

test("a daily-cap rejection releases the row claim without making a vendor slot", async () => {
  let released = false;
  const result = await acquireVendorCallSlot({
    claim: async () => true,
    reserve: async () => false,
    releaseClaim: async () => {
      released = true;
    },
  });
  assert.equal(result, "daily-cap-reached");
  assert.equal(released, true);
});
