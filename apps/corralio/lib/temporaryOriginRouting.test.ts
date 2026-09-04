import assert from "node:assert/strict";
import test from "node:test";

import {
  routeCurrentLocationWithDependencies,
  type CurrentLocationRouteDependencies,
  type RoutingEvent,
} from "./temporaryOrigin";

function fixtureEvent(overrides: Partial<RoutingEvent> = {}): RoutingEvent {
  return {
    id: "event-a",
    household_id: "household-a",
    schedule_source_id: null,
    team_id: null,
    starts_at: "2026-09-05T17:00:00.000Z",
    ends_at: "2026-09-05T18:00:00.000Z",
    schedule_arrival_at: null,
    location_lat: 47.7,
    location_lng: -117.4,
    location_geocoded_at: "2026-09-04T10:00:00.000Z",
    source_arrival_minutes: null,
    team_arrival_minutes: null,
    ...overrides,
  };
}

function dependencies(overrides: Partial<CurrentLocationRouteDependencies> = {}) {
  const calls: string[] = [];
  const value: CurrentLocationRouteDependencies = {
    loadEvent: async () => { calls.push("load"); return fixtureEvent(); },
    claim: async () => { calls.push("claim"); return true; },
    reserve: async () => { calls.push("reserve"); return true; },
    route: async () => {
      calls.push("route");
      return { kind: "success", value: { durationMinutes: 20, distanceMeters: 10_000 }, latencyMs: 4 };
    },
    release: async () => { calls.push("release"); },
    logSkip: async () => { calls.push("log-skip"); },
    logResult: async () => { calls.push("log-result"); },
    ...overrides,
  };
  return { calls, value };
}

test("invalid coordinates are rejected before event lookup or provider access", async () => {
  const fixture = dependencies();
  assert.deepEqual(await routeCurrentLocationWithDependencies({ lat: 100, lng: 0 }, fixture.value), { status: "invalid" });
  assert.deepEqual(fixture.calls, []);
});

test("unauthorized or ineligible event stops before claim, quota, and provider", async () => {
  const fixture = dependencies({ loadEvent: async () => { fixture.calls.push("load"); return null; } });
  assert.deepEqual(await routeCurrentLocationWithDependencies({ lat: 47.6, lng: -117.4 }, fixture.value), { status: "unavailable" });
  assert.deepEqual(fixture.calls, ["load"]);
});

test("concurrent duplicate loses the payload-free claim before quota and provider", async () => {
  const fixture = dependencies({ claim: async () => { fixture.calls.push("claim"); return false; } });
  assert.deepEqual(await routeCurrentLocationWithDependencies({ lat: 47.6, lng: -117.4 }, fixture.value), { status: "busy" });
  assert.deepEqual(fixture.calls, ["load", "claim", "log-skip"]);
});

test("one current-location route retains its payload-free claim to suppress replayed clicks", async () => {
  const fixture = dependencies();
  assert.deepEqual(await routeCurrentLocationWithDependencies({ lat: 47.6, lng: -117.4 }, fixture.value), {
    status: "success",
    originKind: "current_location",
    estimatedDriveMinutes: 20,
  });
  assert.deepEqual(fixture.calls, ["load", "claim", "reserve", "route", "log-result"]);
});

test("daily cap prevents provider access and still releases the claim", async () => {
  const fixture = dependencies({ reserve: async () => { fixture.calls.push("reserve"); return false; } });
  assert.deepEqual(await routeCurrentLocationWithDependencies({ lat: 47.6, lng: -117.4 }, fixture.value), { status: "unavailable" });
  assert.deepEqual(fixture.calls, ["load", "claim", "reserve", "log-skip", "release"]);
});
