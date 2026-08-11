import test from "node:test";
import assert from "node:assert/strict";

import { parseTeamHotelRoomCount } from "./teamHotelRequest";

test("team hotel rooms have a five-room minimum and no product maximum", () => {
  assert.equal(parseTeamHotelRoomCount(5), 5);
  assert.equal(parseTeamHotelRoomCount(13), 13);
  assert.equal(parseTeamHotelRoomCount(120), 120);
  assert.equal(parseTeamHotelRoomCount(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
});

test("team hotel rooms reject unsafe, fractional, and below-minimum values", () => {
  for (const value of [4, 5.5, "not-a-number", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parseTeamHotelRoomCount(value), /Enter at least 5 rooms/);
  }
});
