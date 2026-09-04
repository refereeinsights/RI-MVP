import assert from "node:assert/strict";
import test from "node:test";
import {
  formatHotelSearchDateRange,
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
  assert.deepEqual(validateHotelSearchDateRange("2026-09-26", "2026-09-28"), {
    ok: true,
    checkIn: "2026-09-26",
    checkOut: "2026-09-28",
  });
  assert.deepEqual(validateHotelSearchDateRange("2026-09-26", "2026-09-26"), {
    ok: false,
    error: "Check-out must be after check-in.",
  });
  assert.deepEqual(validateHotelSearchDateRange("2026-09-28", "2026-09-26"), {
    ok: false,
    error: "Check-out must be after check-in.",
  });
  assert.deepEqual(validateHotelSearchDateRange("", "2026-09-28"), {
    ok: false,
    error: "Choose valid check-in and check-out dates.",
  });
});

test("formats the active search dates without local-timezone drift", () => {
  assert.equal(formatHotelSearchDateRange("09/26/2026", "09/28/2026"), "Sep 26, 2026 – Sep 28, 2026");
  assert.equal(formatHotelSearchDateRange(null, "09/28/2026"), null);
});
