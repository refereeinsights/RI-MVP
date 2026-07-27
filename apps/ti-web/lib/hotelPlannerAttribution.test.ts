import test from "node:test";
import assert from "node:assert/strict";

import {
  HOTEL_PLANNER_BOOKING_PLACEMENTS,
  buildHotelPlannerBookingAttribution,
  createOutboundAttributionId,
  deriveHotelPlannerSourcePageType,
  formatOutboundAttributionToken,
  isValidOutboundAttributionId,
} from "./hotelPlannerAttribution";

test("creates compact outbound attribution ids from uuid sources", () => {
  const value = createOutboundAttributionId(() => "11111111-1111-4111-8111-111111111111");
  assert.equal(value, "11111111111141118111111111111111");
  assert.equal(isValidOutboundAttributionId(value), true);
  assert.equal(formatOutboundAttributionToken(value), "attr:11111111111141118111111111111111");
});

test("derives canonical source page types without collapsing book travel", () => {
  assert.equal(deriveHotelPlannerSourcePageType({ source: "book_travel", hasVenueId: false }), "book_travel");
  assert.equal(deriveHotelPlannerSourcePageType({ source: "weekend_planner", hasVenueId: false }), "weekend_planner");
  assert.equal(deriveHotelPlannerSourcePageType({ source: "venue_map", hasVenueId: true }), "venue_map");
  assert.equal(deriveHotelPlannerSourcePageType({ sourcePath: "/weekend/abc", hasVenueId: true }), "weekend");
});

test("builds canonical booking attribution while preserving legacy fields", () => {
  const attribution = buildHotelPlannerBookingAttribution({
    outboundAttributionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sourcePageType: "book_travel",
    placement: HOTEL_PLANNER_BOOKING_PLACEMENTS.bookTravelPropertyCard,
    venueId: null,
    tournamentRef: null,
    keyword: "Tournament weekend stay",
    jobCode: "TI-BOOK-TRAVEL",
    custom1: "src:book_travel",
    custom2: "Phoenix, AZ",
    plannerSessionId: "22222222-2222-4222-8222-222222222222",
  });

  assert.equal(attribution.sc, "tournamentinsights");
  assert.equal(attribution.jobCode, "TI-BOOK-TRAVEL");
  assert.equal(attribution.custom1, "src:book_travel");
  assert.equal(attribution.custom2, "Phoenix, AZ");
  assert.equal(attribution.custom3, "attr:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(attribution.custom4, "srcp:book_travel");
  assert.equal(attribution.custom5, "place:book_travel_property_card");
  assert.equal(attribution.custom6, "plan:22222222-2222-4222-8222-222222222222");
});
