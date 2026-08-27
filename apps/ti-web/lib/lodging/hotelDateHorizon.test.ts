import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateHotelSearchDateHorizon,
  HOTEL_DATE_HORIZON_REASON,
  hotelSearchMaxDateIso,
} from "./hotelDateHorizon";

const NOW = new Date("2026-08-27T18:00:00.000Z");

test("allows a valid near-term hotel search", () => {
  assert.equal(
    evaluateHotelSearchDateHorizon({ checkIn: "09/25/2026", checkOut: "09/27/2026", now: NOW }).status,
    "supported"
  );
});

test("allows both dates on the inclusive TI safety boundary", () => {
  const boundary = hotelSearchMaxDateIso(NOW);
  assert.equal(boundary, "2028-08-26");
  assert.equal(
    evaluateHotelSearchDateHorizon({ checkIn: "2028-08-25", checkOut: boundary, now: NOW }).status,
    "supported"
  );
});

test("rejects a check-in or checkout beyond the boundary with a distinct reason", () => {
  assert.deepEqual(
    evaluateHotelSearchDateHorizon({ checkIn: "2028-08-26", checkOut: "2028-08-27", now: NOW }),
    {
      status: "unsupported",
      reason: HOTEL_DATE_HORIZON_REASON,
      maxDateIso: "2028-08-26",
    }
  );
});

test("leaves malformed date classification to existing request validation", () => {
  assert.equal(
    evaluateHotelSearchDateHorizon({ checkIn: "2026-02-30", checkOut: "2026-03-02", now: NOW }).status,
    "invalid"
  );
});
