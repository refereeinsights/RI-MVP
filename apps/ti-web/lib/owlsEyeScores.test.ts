import test from "node:test";
import assert from "node:assert/strict";
import { mostSelectedBringFieldChairs } from "./owlsEyeScores";

test("mostSelectedBringFieldChairs: returns Yes when true is mode", () => {
  const value = mostSelectedBringFieldChairs([true, false, true, null, undefined]);
  assert.equal(value, "Yes");
});

test("mostSelectedBringFieldChairs: returns No when false is mode", () => {
  const value = mostSelectedBringFieldChairs([false, false, true]);
  assert.equal(value, "No");
});

test("mostSelectedBringFieldChairs: uses fallback when no review votes", () => {
  assert.equal(mostSelectedBringFieldChairs([null, undefined], true), "Yes");
  assert.equal(mostSelectedBringFieldChairs([null, undefined], false), "No");
  assert.equal(mostSelectedBringFieldChairs([null, undefined], null), "—");
});
