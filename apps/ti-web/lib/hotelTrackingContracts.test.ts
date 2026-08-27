import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("persists the tournament-map hotel handoff events", () => {
  const analyticsRoute = source("../app/api/analytics/route.ts");
  assert.match(analyticsRoute, /"hotel_pin_click"/);
  assert.match(analyticsRoute, /"hotel_checkout_handoff"/);
});

test("normalizes tournament-map hotel events with source and placement", () => {
  const mapClient = source("../app/tournaments/[slug]/map/TournamentVenueMapClient.tsx");
  assert.match(mapClient, /source_page_type: "venue_map"/);
  assert.match(mapClient, /cta_placement: HOTEL_PLANNER_BOOKING_PLACEMENTS\.venueMapViewAllHotels/);
  assert.match(mapClient, /outbound_attribution_id: handoff\.outboundAttributionId/);
});

test("carries tournament property handoff identifiers into click analytics", () => {
  const tournamentHotels = source("../app/tournaments/[slug]/hotels/TournamentHotelsClient.tsx");
  assert.match(tournamentHotels, /trackPropertyClick\(hotel, propertyHandoff\)/);
  assert.match(tournamentHotels, /outbound_request_id: handoff\.outboundRequestId/);
  assert.match(tournamentHotels, /outbound_attribution_id: handoff\.outboundAttributionId/);
});

test("carries the lodging search id into generic hotel handoffs", () => {
  const planner = source("../app/weekend-planner/WeekendPlannerClient.tsx");
  assert.match(planner, /setHotelSearchSessionId\(data\.sessionId \?\? null\)/);
  assert.match(planner, /set\("lodging_search_id", hotelSearchSessionId\)/);
});

test("assigns the canonical Weekend hotel placement to URL and event", () => {
  const weekendPage = source("../app/weekend/[slug]/page.tsx");
  const weekendCtas = source("../app/weekend/[slug]/WeekendPlanningCtasClient.tsx");
  assert.match(weekendPage, /HOTEL_PLANNER_BOOKING_PLACEMENTS\.weekendShareHotels/);
  assert.match(weekendCtas, /cta_placement: HOTEL_PLANNER_BOOKING_PLACEMENTS\.weekendShareHotels/);
});
