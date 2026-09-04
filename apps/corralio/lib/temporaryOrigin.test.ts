import assert from "node:assert/strict";
import test from "node:test";

import {
  isAlternateRouteFresh,
  isTemporaryOriginActive,
  leaveByForSelectedOrigin,
  parseCurrentLocationCoordinates,
  temporaryOriginExpiresAt,
} from "./temporaryOrigin";

test("current-location coordinate validation accepts only finite plausible pairs", () => {
  assert.deepEqual(parseCurrentLocationCoordinates({ lat: 47.66, lng: -117.42 }), { lat: 47.66, lng: -117.42 });
  assert.equal(parseCurrentLocationCoordinates({ lat: 91, lng: 0 }), null);
  assert.equal(parseCurrentLocationCoordinates({ lat: 0, lng: Number.NaN }), null);
  assert.equal(parseCurrentLocationCoordinates({ lat: "47.66", lng: -117.42 }), null);
});

test("alternate origin expiry follows current event end or start plus 24 hours", () => {
  assert.equal(temporaryOriginExpiresAt({
    startsAt: "2026-09-05T15:00:00.000Z",
    endsAt: "2026-09-05T17:00:00.000Z",
  }), "2026-09-06T17:00:00.000Z");
  assert.equal(temporaryOriginExpiresAt({
    startsAt: "2026-09-05T15:00:00.000Z",
    endsAt: null,
  }), "2026-09-06T15:00:00.000Z");
  assert.equal(isTemporaryOriginActive({
    startsAt: "2026-09-05T15:00:00.000Z",
    endsAt: null,
  }, Date.parse("2026-09-06T14:59:59.000Z")), true);
  assert.equal(isTemporaryOriginActive({
    startsAt: "2026-09-04T15:00:00.000Z",
    endsAt: null,
  }, Date.parse("2026-09-06T14:59:59.000Z")), false);
});

test("alternate route freshness depends on both origin and destination geocoding", () => {
  assert.equal(isAlternateRouteFresh({
    routeComputedAt: "2026-09-04T12:00:00.000Z",
    originGeocodedAt: "2026-09-04T11:00:00.000Z",
    locationGeocodedAt: "2026-09-04T10:00:00.000Z",
  }), true);
  assert.equal(isAlternateRouteFresh({
    routeComputedAt: "2026-09-04T12:00:00.000Z",
    originGeocodedAt: "2026-09-04T12:01:00.000Z",
    locationGeocodedAt: "2026-09-04T10:00:00.000Z",
  }), false);
  assert.equal(isAlternateRouteFresh({
    routeComputedAt: "2026-09-04T12:00:00.000Z",
    originGeocodedAt: "2026-09-04T11:00:00.000Z",
    locationGeocodedAt: "2026-09-04T12:01:00.000Z",
  }), false);
});

test("selected-origin drive duration consumes the existing required-arrival hierarchy", () => {
  const base = {
    startsAt: "2026-09-05T17:00:00.000Z",
    scheduleArrivalAt: null,
    sourceArrivalMinutes: 45,
    teamArrivalMinutes: 60,
  };
  assert.deepEqual(leaveByForSelectedOrigin(base, 20), {
    leaveByAt: "2026-09-05T15:55:00.000Z",
    source: "source_preference",
  });
  assert.deepEqual(leaveByForSelectedOrigin({
    ...base,
    scheduleArrivalAt: "2026-09-05T15:30:00.000Z",
  }, 20), {
    leaveByAt: "2026-09-05T15:10:00.000Z",
    source: "ics_explicit",
  });
  assert.deepEqual(leaveByForSelectedOrigin({
    ...base,
    sourceArrivalMinutes: null,
  }, 20), {
    leaveByAt: "2026-09-05T15:40:00.000Z",
    source: "team_preference",
  });
  assert.deepEqual(leaveByForSelectedOrigin({
    ...base,
    sourceArrivalMinutes: null,
    teamArrivalMinutes: null,
  }, 20), {
    leaveByAt: "2026-09-05T16:10:00.000Z",
    source: "corralio_default",
  });
});
