import assert from "node:assert/strict";
import test from "node:test";

import { getThisWeekendRangeLocal, isInThisWeekend } from "./weekend";

test("uses the upcoming Friday through exclusive Monday on a weekday", () => {
  const range = getThisWeekendRangeLocal(new Date(2026, 7, 18, 12));
  assert.equal(range.start.getDay(), 5);
  assert.equal(range.start.getDate(), 21);
  assert.equal(range.end.getDay(), 1);
  assert.equal(range.end.getDate(), 24);
});

test("keeps Saturday and Sunday in the current weekend", () => {
  assert.equal(getThisWeekendRangeLocal(new Date(2026, 7, 22, 12)).start.getDate(), 21);
  assert.equal(getThisWeekendRangeLocal(new Date(2026, 7, 23, 12)).start.getDate(), 21);
});

test("filters events using an exclusive Monday boundary", () => {
  const now = new Date(2026, 7, 18, 12);
  assert.equal(isInThisWeekend(new Date(2026, 7, 22, 9).toISOString(), now), true);
  assert.equal(isInThisWeekend(new Date(2026, 7, 24, 0).toISOString(), now), false);
});
