import test from "node:test";
import assert from "node:assert/strict";
import {
  VENUE_HOTEL_PLACEMENTS,
  acceptVenueHotelClickAttempt,
  appendVenueHotelTrackingToHref,
  completeVenueHotelClickAttempt,
  createInitialClickAttemptState,
  createInitialImpressionTrackerState,
  isAnalyticsUuid,
  nextImpressionTrackerState,
  resolveDeviceType,
  resolveTrafficSourceFromPageUrl,
  resolveVenueHotelContext,
} from "./venueHotelFunnel";

test("venue hotel placements resolve to canonical venue context", () => {
  const context = resolveVenueHotelContext({
    ctaPlacement: VENUE_HOTEL_PLACEMENTS.venueDirectoryCardLink,
    pageUrl: "/venues/123?utm_source=google",
    sessionId: "11111111-1111-4111-8111-111111111111",
    ctaInstanceId: "22222222-2222-4222-8222-222222222222",
    deviceType: "mobile",
    trafficSource: "google",
  });

  assert.equal(context.page_type, "venue");
  assert.equal(context.flow_type, "direct_outbound");
  assert.equal(context.cta_type, "hotel");
  assert.equal(context.cta_placement, VENUE_HOTEL_PLACEMENTS.venueDirectoryCardLink);
});

test("appendVenueHotelTrackingToHref adds stable funnel identifiers", () => {
  const href = appendVenueHotelTrackingToHref({
    href: "/go/hotels?venueId=abc",
    sessionId: "11111111-1111-4111-8111-111111111111",
    ctaInstanceId: "22222222-2222-4222-8222-222222222222",
    ctaInteractionId: "33333333-3333-4333-8333-333333333333",
    ctaPlacement: VENUE_HOTEL_PLACEMENTS.venueDirectoryTextLink,
    pageUrl: "/venues/abc?utm_source=email",
    deviceType: "desktop",
    trafficSource: "email",
    outboundRequestId: "44444444-4444-4444-8444-444444444444",
  });

  const url = new URL(href, "https://www.tournamentinsights.com");
  assert.equal(url.searchParams.get("cta_instance_id"), "22222222-2222-4222-8222-222222222222");
  assert.equal(url.searchParams.get("cta_interaction_id"), "33333333-3333-4333-8333-333333333333");
  assert.equal(url.searchParams.get("cta_placement"), VENUE_HOTEL_PLACEMENTS.venueDirectoryTextLink);
  assert.equal(url.searchParams.get("page_type"), "venue");
  assert.equal(url.searchParams.get("traffic_source"), "email");
  assert.equal(url.searchParams.get("outbound_request_id"), "44444444-4444-4444-8444-444444444444");
});

test("impression tracking fires once after sustained visibility", () => {
  const initial = createInitialImpressionTrackerState();
  const firstVisible = nextImpressionTrackerState(initial, { isVisible: true, nowMs: 1_000 });
  assert.equal(firstVisible.shouldTrack, false);
  assert.equal(firstVisible.state.tracked, false);

  const beforeThreshold = nextImpressionTrackerState(firstVisible.state, { isVisible: true, nowMs: 1_400 });
  assert.equal(beforeThreshold.shouldTrack, false);

  const atThreshold = nextImpressionTrackerState(beforeThreshold.state, { isVisible: true, nowMs: 1_500 });
  assert.equal(atThreshold.shouldTrack, true);
  assert.equal(atThreshold.state.tracked, true);

  const duplicate = nextImpressionTrackerState(atThreshold.state, { isVisible: true, nowMs: 2_000 });
  assert.equal(duplicate.shouldTrack, false);
});

test("impression tracking resets if visibility drops before threshold", () => {
  const initial = createInitialImpressionTrackerState();
  const visible = nextImpressionTrackerState(initial, { isVisible: true, nowMs: 10 });
  const hidden = nextImpressionTrackerState(visible.state, { isVisible: false, nowMs: 300 });
  const visibleAgain = nextImpressionTrackerState(hidden.state, { isVisible: true, nowMs: 400 });
  const tracked = nextImpressionTrackerState(visibleAgain.state, { isVisible: true, nowMs: 900 });
  assert.equal(tracked.shouldTrack, true);
});

test("click lifecycle creates one interaction id per accepted attempt", () => {
  const state = createInitialClickAttemptState();
  const first = acceptVenueHotelClickAttempt(state, () => "55555555-5555-4555-8555-555555555555");
  assert.equal(first.accepted, true);
  assert.equal(first.interactionId, "55555555-5555-4555-8555-555555555555");

  const duplicate = acceptVenueHotelClickAttempt(first.state, () => "66666666-6666-4666-8666-666666666666");
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.interactionId, "55555555-5555-4555-8555-555555555555");

  const completed = completeVenueHotelClickAttempt(first.state);
  const later = acceptVenueHotelClickAttempt(completed, () => "77777777-7777-4777-8777-777777777777");
  assert.equal(later.accepted, true);
  assert.equal(later.interactionId, "77777777-7777-4777-8777-777777777777");
});

test("device and traffic helpers stay deterministic", () => {
  assert.equal(resolveDeviceType(375), "mobile");
  assert.equal(resolveDeviceType(1280), "desktop");
  assert.equal(resolveTrafficSourceFromPageUrl("/venues/abc?utm_source=facebook"), "facebook");
  assert.equal(resolveTrafficSourceFromPageUrl("/venues/abc"), null);
});

test("analytics UUID validation matches generated funnel ids", () => {
  assert.equal(isAnalyticsUuid("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isAnalyticsUuid("not-a-uuid"), false);
});
