import assert from "node:assert/strict";
import test from "node:test";

import {
  GENERIC_HOTEL_SEARCH_SOURCES,
  isGenericHotelSearchSource,
} from "./genericHotelSearchSource";

test("allows only the three approved generic hotel-search surfaces", () => {
  assert.deepEqual(GENERIC_HOTEL_SEARCH_SOURCES, [
    "book_travel",
    "weekend_planner",
    "referee_travel",
  ]);

  for (const source of GENERIC_HOTEL_SEARCH_SOURCES) {
    assert.equal(isGenericHotelSearchSource(source), true);
  }
});

test("rejects arbitrary, look-alike, and missing generic search sources", () => {
  for (const source of [
    null,
    "",
    "referee",
    "referee_venue_detail",
    "referee_travel_extra",
    "Referee_Travel",
    "other",
  ]) {
    assert.equal(isGenericHotelSearchSource(source), false);
  }
});
