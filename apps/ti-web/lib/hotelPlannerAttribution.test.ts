import test from "node:test";
import assert from "node:assert/strict";

import {
  HOTEL_PLANNER_BOOKING_PLACEMENTS,
  HOTEL_PLANNER_GROUP_REQUEST_PLACEMENTS,
  buildHotelPlannerBookingAttribution,
  buildHotelPlannerGroupRequestAttribution,
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
  assert.equal(
    deriveHotelPlannerSourcePageType({ sourcePath: "/team-hotel-booking", hasVenueId: false }),
    "team_hotel_booking"
  );
  assert.equal(deriveHotelPlannerSourcePageType({ source: "weekend_planner", hasVenueId: false }), "weekend_planner");
  assert.equal(deriveHotelPlannerSourcePageType({ source: "venue_map", hasVenueId: true }), "venue_map");
  assert.equal(deriveHotelPlannerSourcePageType({ source: "tournament_hotels", hasVenueId: true }), "tournament_hotels");
  assert.equal(
    deriveHotelPlannerSourcePageType({ pageType: "tournament_hotels", sourcePath: "/tournaments/example/hotels", hasVenueId: false }),
    "tournament_hotels"
  );
  assert.equal(deriveHotelPlannerSourcePageType({ sourcePath: "/weekend/abc", hasVenueId: true }), "weekend");
});

test("adds tournament hotels attribution without changing protected source baselines", () => {
  const protectedBaselines = [
    { sourcePageType: "book_travel" as const, expectedJobCode: "TI-BOOK-TRAVEL" },
    { sourcePageType: "weekend_planner" as const, expectedJobCode: "TI-BOOK-TRAVEL" },
    { sourcePageType: "venue_map" as const, expectedJobCode: "TI-VENUE-MAP" },
    { sourcePageType: "venue" as const, expectedJobCode: "TI-HOTELS" },
    { sourcePageType: "referee" as const, expectedJobCode: "TI-HOTELS" },
  ];

  for (const baseline of protectedBaselines) {
    const actual = buildHotelPlannerBookingAttribution({
      outboundAttributionId: "cccccccccccccccccccccccccccccccc",
      sourcePageType: baseline.sourcePageType,
      placement: "baseline",
      venueId: "33333333-3333-4333-8333-333333333333",
      tournamentRef: "baseline-tournament",
    });
    assert.equal(actual.jobCode, baseline.expectedJobCode);
    assert.equal(actual.custom1, "ven:33333333-3333-4333-8333-333333333333");
    assert.equal(actual.custom2, "baseline-tournament");
    assert.equal(actual.custom3, "attr:cccccccccccccccccccccccccccccccc");
    assert.equal(actual.custom4, `srcp:${baseline.sourcePageType}`);
    assert.equal(actual.custom5, "place:baseline");
  }

  const tournamentHotels = buildHotelPlannerBookingAttribution({
    outboundAttributionId: "dddddddddddddddddddddddddddddddd",
    sourcePageType: "tournament_hotels",
    placement: HOTEL_PLANNER_BOOKING_PLACEMENTS.tournamentHotelsProperty,
    venueId: "33333333-3333-4333-8333-333333333333",
    tournamentRef: "spring-classic",
    custom8: `${"Tournament ".repeat(20)}name`,
  });

  assert.equal(tournamentHotels.jobCode, "TI-TOURNAMENT-HOTELS");
  assert.equal(tournamentHotels.custom4, "srcp:tournament_hotels");
  assert.equal(tournamentHotels.custom5, "place:tournament_hotels_property");
  assert.equal(tournamentHotels.custom8?.length, 128);
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

test("builds canonical group-request attribution without placing labels in custom id slots", () => {
  const attribution = buildHotelPlannerGroupRequestAttribution({
    outboundAttributionId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    sourcePageType: "venue_map",
    placement: HOTEL_PLANNER_GROUP_REQUEST_PLACEMENTS.venueMapTeamBlock,
    venueId: "33333333-3333-4333-8333-333333333333",
    tournamentId: "44444444-4444-4444-8444-444444444444",
    plannerSessionId: "55555555-5555-4555-8555-555555555555",
    custom8: "San Diego Convention Center — San Diego, CA",
  });

  assert.equal(attribution.sc, "tournamentinsights");
  assert.equal(attribution.keyword, "Team hotel block");
  assert.equal(attribution.jobCode, "TI-TEAM-BLOCK");
  assert.equal(attribution.custom1, "ven:33333333-3333-4333-8333-333333333333");
  assert.equal(attribution.custom2, "tour:44444444-4444-4444-8444-444444444444");
  assert.equal(attribution.custom3, "attr:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  assert.equal(attribution.custom4, "srcp:venue_map");
  assert.equal(attribution.custom5, "place:venue_map_team_block");
  assert.equal(attribution.custom6, "plan:55555555-5555-4555-8555-555555555555");
  assert.equal(attribution.custom8, "San Diego Convention Center — San Diego, CA");
});
