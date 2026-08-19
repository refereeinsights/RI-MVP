import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("all HotelPlanner handoff routes persist the canonical session and director traffic source", () => {
  for (const path of [
    "../app/go/hotels/route.ts",
    "../app/go/hotels/property/route.ts",
    "../app/go/hotels/checkout/route.ts",
  ]) {
    const contents = source(path);
    assert.match(contents, /normalizeHotelDistributionSource/);
    assert.match(contents, /resolveHotelTrafficSource/);
    assert.match(contents, /session_id:/);
    assert.match(contents, /traffic_source:/);
  }
});

test("checkout keeps director analytics out of HotelPlanner Custom fields", () => {
  const contents = source("../app/go/hotels/checkout/route.ts");
  const attributionBlock = contents.slice(
    contents.indexOf("const attribution = buildHotelPlannerBookingAttribution"),
    contents.indexOf("const fallbackPath")
  );
  assert.doesNotMatch(attributionBlock, /distributionSource|distribution_source|director:/);
});

test("meaningful hotel surfaces reuse the first-party lodging session", () => {
  for (const path of [
    "../app/tournaments/[slug]/hotels/TournamentHotelsClient.tsx",
    "../app/tournaments/[slug]/map/TournamentVenueMapClient.tsx",
    "../components/venues/VenueHotelLink.tsx",
    "../app/weekend-planner/WeekendPlannerClient.tsx",
  ]) {
    const contents = source(path);
    assert.match(contents, /readOrCreateLodgingSessionId/);
    assert.match(contents, /readOrRememberHotelDistributionSource/);
  }
});

test("analytics API validates hotel measurement properties before persistence", () => {
  const contents = source("../app/api/analytics/route.ts");
  assert.match(contents, /normalizeHotelMeasurementProperties/);
  assert.match(contents, /HOTEL_MEASUREMENT_EVENTS/);
  assert.match(contents, /distribution_source: hotelMeasurement\.distribution_source/);
});
