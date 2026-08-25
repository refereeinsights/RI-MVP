import assert from "node:assert/strict";
import test from "node:test";

import { parseProvisionalPlaceIdentity } from "./provisionalVenues";

test("parses bounded named-place identity without retaining event instructions", () => {
  const parsed = parseProvisionalPlaceIdentity("Dwight Merkel Sports Complex, 5701 North Assembly Street, Spokane, WA - Field 4");
  assert.deepEqual(parsed && {
    placeName: parsed.placeName,
    normalizedPlaceName: parsed.normalizedPlaceName,
    normalizedAddress: parsed.normalizedAddress,
    city: parsed.city,
    state: parsed.state,
  }, {
    placeName: "Dwight Merkel Sports Complex",
    normalizedPlaceName: "dwight merkel sports complex",
    normalizedAddress: "5701 north assembly street",
    city: "spokane",
    state: "WA",
  });
  assert.equal(parsed?.identityKey.length, 64);
});

test("named non-sports public places qualify without a keyword allowlist", () => {
  for (const location of [
    "St Mark Church, Boise, ID",
    "Riverside Convention Center, Spokane, WA",
    "Airport Conference Hotel, SeaTac, WA",
    "North County Fairgrounds, Monroe, WA",
  ]) assert.ok(parseProvisionalPlaceIdentity(location), location);
});

test("rejects bare addresses, street names, logistics, private markers, and orphan sublocations", () => {
  for (const location of [
    "1427 N Sullivan Rd, Spokane, WA",
    "Park Avenue, Spokane, WA",
    "Court Street, Spokane, WA",
    "Meet at Central Park parking lot, Spokane, WA",
    "School pickup, Spokane, WA",
    "Home field, Spokane, WA",
    "Away gym, Spokane, WA",
    "Field 4, Spokane, WA",
    "Court 2, Spokane, WA",
    "TBD, Spokane, WA",
  ]) assert.equal(parseProvisionalPlaceIdentity(location), null, location);
});

test("formatting aliases converge to one deterministic identity", () => {
  const first = parseProvisionalPlaceIdentity("Mead High School, 302 W Hastings Rd, Spokane, WA");
  const second = parseProvisionalPlaceIdentity("  Mead High School , 302 West Hastings Road, Spokane, Washington ");
  assert.equal(first?.identityKey, second?.identityKey);
});

test("logistical trailing fragments reject the candidate instead of entering shared data", () => {
  assert.equal(
    parseProvisionalPlaceIdentity("Central Community Center, use east parking entrance, Tacoma, WA"),
    null,
  );
});
