import assert from "node:assert/strict";
import test from "node:test";

import { HotelPlannerApiError } from "./hotelPlannerProvider";
import { classifyHotelSearchFailure } from "./hotelReliability";
import { tournamentHotelRecoveryCopy } from "./hotelRecovery";

test("classifies malformed HotelPlanner JSON without retaining payload details", () => {
  const error = new HotelPlannerApiError(
    "Invalid JSON response from HotelPlanner for multiPropertySearch",
    200,
    null,
    "<private-provider-body>"
  );
  assert.deepEqual(classifyHotelSearchFailure(error), {
    category: "RESPONSE_PARSING_FAILURE",
    statusCode: 502,
    errorCode: "response_parsing_failure",
    publicMessage: "Hotel search response could not be processed.",
  });
});

test("classifies HTTP-success semantic rejection separately from transport failure", () => {
  const result = classifyHotelSearchFailure(new HotelPlannerApiError("Rejected", 200, 200, "private"));
  assert.equal(result.category, "UPSTREAM_REQUEST_FAILURE");
  assert.equal(result.errorCode, "upstream_rejected_response");
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("uses positive contextual recovery and a generic fallback only without context", () => {
  assert.deepEqual(tournamentHotelRecoveryCopy(true), {
    heading: "Find available hotels for your tournament",
    body: "Search live availability with our hotel partner.",
    cta: "Find Hotels Near the Venue",
    href: null,
  });
  assert.equal(tournamentHotelRecoveryCopy(false).href, "/book-travel");
  assert.equal(tournamentHotelRecoveryCopy(false).cta, "Find Hotels");
});
