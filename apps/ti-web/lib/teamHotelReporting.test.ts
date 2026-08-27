import assert from "node:assert/strict";
import test from "node:test";
import { isQualifiedTeamHotelAcceptedRequest } from "./teamHotelReporting";

const TEST_TODAY = new Date(Date.UTC(2026, 7, 10));

test("qualified accepted request requires succeeded lifecycle and stable ids", () => {
  assert.equal(
    isQualifiedTeamHotelAcceptedRequest({
      status: "succeeded",
      group_request_id: "req_123",
      outbound_attribution_id: "abc123def456",
      search_query: {
        destination: "San Diego Convention Center, San Diego, CA",
        checkIn: "08/20/2026",
        checkOut: "08/22/2026",
        rooms: 10,
      },
    }, TEST_TODAY),
    true,
  );
});

test("qualified accepted request rejects past or undersized requests", () => {
  assert.equal(
    isQualifiedTeamHotelAcceptedRequest({
      status: "succeeded",
      group_request_id: "req_123",
      outbound_attribution_id: "abc123def456",
      search_query: {
        destination: "San Diego Convention Center, San Diego, CA",
        checkIn: "08/01/2026",
        checkOut: "08/02/2026",
        rooms: 10,
      },
    }, new Date(Date.UTC(2026, 7, 4))),
    false,
  );

  assert.equal(
    isQualifiedTeamHotelAcceptedRequest({
      status: "succeeded",
      group_request_id: "req_123",
      outbound_attribution_id: "abc123def456",
      search_query: {
        destination: "San Diego Convention Center, San Diego, CA",
        checkIn: "08/20/2026",
        checkOut: "08/22/2026",
        rooms: 4,
      },
    }, TEST_TODAY),
    false,
  );
});

test("qualified accepted request rejects missing accepted-request authority", () => {
  assert.equal(
    isQualifiedTeamHotelAcceptedRequest({
      status: "started",
      group_request_id: null,
      outbound_attribution_id: "abc123def456",
      search_query: {
        destination: "San Diego Convention Center, San Diego, CA",
        checkIn: "08/20/2026",
        checkOut: "08/22/2026",
        rooms: 10,
      },
    }),
    false,
  );
});
