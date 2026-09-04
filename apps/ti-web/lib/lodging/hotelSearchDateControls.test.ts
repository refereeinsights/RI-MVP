import assert from "node:assert/strict";
import test from "node:test";
import {
  formatHotelSearchDateRange,
  hotelSearchDateInputBounds,
  hotelPlannerDateToIso,
  validateHotelSearchDateRange,
} from "./hotelSearchDateControls";

test("converts HotelPlanner dates to native date-input values", () => {
  assert.equal(hotelPlannerDateToIso("09/26/2026"), "2026-09-26");
  assert.equal(hotelPlannerDateToIso("9/7/2026"), "2026-09-07");
  assert.equal(hotelPlannerDateToIso("02/30/2026"), "");
  assert.equal(hotelPlannerDateToIso(null), "");
});

test("requires a valid checkout after check-in", () => {
  const now = new Date("2026-09-04T18:00:00Z");
  assert.deepEqual(validateHotelSearchDateRange("2026-09-26", "2026-09-28", now), {
    ok: true,
    checkIn: "2026-09-26",
    checkOut: "2026-09-28",
  });
  assert.deepEqual(validateHotelSearchDateRange("2026-09-26", "2026-09-26", now), {
    ok: false,
    error: "Check-out must be after check-in.",
  });
  assert.deepEqual(validateHotelSearchDateRange("2026-09-28", "2026-09-26", now), {
    ok: false,
    error: "Check-out must be after check-in.",
  });
  assert.deepEqual(validateHotelSearchDateRange("", "2026-09-28", now), {
    ok: false,
    error: "Choose valid check-in and check-out dates.",
  });
});

test("rejects past and unsupported dates using an injected UTC clock", () => {
  const now = new Date("2026-09-04T23:59:59Z");
  assert.deepEqual(hotelSearchDateInputBounds(now), {
    min: "2026-09-04",
    max: "2028-09-03",
  });
  assert.deepEqual(validateHotelSearchDateRange("2026-09-03", "2026-09-05", now), {
    ok: false,
    error: "Check-in must be today or later.",
  });
  assert.deepEqual(validateHotelSearchDateRange("2028-09-03", "2028-09-04", now), {
    ok: false,
    error: "Choose dates within the supported hotel search window.",
  });
});

test("formats the active search dates without local-timezone drift", () => {
  assert.equal(formatHotelSearchDateRange("09/26/2026", "09/28/2026"), "Sep 26, 2026 – Sep 28, 2026");
  assert.equal(formatHotelSearchDateRange(null, "09/28/2026"), null);
});
