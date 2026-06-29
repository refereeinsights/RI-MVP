import test from "node:test";
import assert from "node:assert/strict";
import { buildBookingSearchString, buildHotelsHref, canShowBookingCta, isValidZip5 } from "./venueBooking";

test("isValidZip5: accepts trimmed 5-digit ZIP", () => {
  assert.equal(isValidZip5("80601"), true);
  assert.equal(isValidZip5(" 80601 "), true);
});

test("isValidZip5: rejects invalid ZIPs", () => {
  assert.equal(isValidZip5(null), false);
  assert.equal(isValidZip5(""), false);
  assert.equal(isValidZip5("8060"), false);
  assert.equal(isValidZip5("80601-1234"), false);
  assert.equal(isValidZip5("ABCDE"), false);
});

test("canShowBookingCta: true only when venue has a valid ZIP", () => {
  assert.equal(canShowBookingCta({ zip: "80601" }), true);
  assert.equal(canShowBookingCta({ zip: " 80601 " }), true);
  assert.equal(canShowBookingCta({ zip: null }), false);
  assert.equal(canShowBookingCta({ zip: "Denver" }), false);
  assert.equal(canShowBookingCta(null), false);
});

test("buildHotelsHref: includes venueId and optional tournamentId", () => {
  assert.equal(
    buildHotelsHref({ venueId: "00000000-0000-4000-8000-000000000000", tournamentId: null }),
    "/go/hotels?venueId=00000000-0000-4000-8000-000000000000"
  );
  assert.equal(
    buildHotelsHref({ venueId: "00000000-0000-4000-8000-000000000000", tournamentId: "11111111-1111-4111-8111-111111111111" }),
    "/go/hotels?venueId=00000000-0000-4000-8000-000000000000&tournamentId=11111111-1111-4111-8111-111111111111"
  );
  assert.equal(
    buildHotelsHref({
      venueId: "00000000-0000-4000-8000-000000000000",
      tournamentId: "11111111-1111-4111-8111-111111111111",
      source: "venue_directory",
      provider: "hotelplanner",
      ss: "Denver, CO",
      latitude: 39.7392,
      longitude: -104.9903,
    }),
    "/go/hotels?venueId=00000000-0000-4000-8000-000000000000&tournamentId=11111111-1111-4111-8111-111111111111&source=venue_directory&provider=hotelplanner&ss=Denver%2C%20CO&lat=39.7392&lng=-104.9903"
  );
});

test("buildBookingSearchString: prefers City+State+ZIP, then City+State, then ZIP", () => {
  assert.equal(
    buildBookingSearchString({ venueName: "Brighton Youth Sports Complex", city: "Brighton", state: "CO", zip: "80601" }),
    "Brighton, CO 80601"
  );

  assert.equal(
    buildBookingSearchString({ venueName: "Brighton Youth Sports Complex", city: "Brighton", state: "CO", zip: null }),
    "Brighton, CO"
  );

  assert.equal(buildBookingSearchString({ venueName: null, city: null, state: null, zip: "80601" }), "80601");
});

test("buildBookingSearchString: uses normalized city when city looks like a region label", () => {
  assert.equal(
    buildBookingSearchString({ venueName: "Brighton Youth Sports Complex", city: "Denver Front Range", state: "CO", zip: "80601" }),
    "Brighton, CO 80601"
  );
});

test("buildBookingSearchString: returns null when no usable inputs exist", () => {
  assert.equal(buildBookingSearchString({ venueName: null, city: null, state: null, zip: null }), null);
  assert.equal(buildBookingSearchString({ venueName: "Some Venue", city: null, state: "Colorado", zip: null }), null);
});
