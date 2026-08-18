import assert from "node:assert/strict";
import test from "node:test";

import {
  CORRALIO_SPORTS,
  corralioSportIcon,
  corralioSportLabel,
  parseCorralioSport,
} from "./sport";

test("source sports use the bounded Corralio taxonomy", () => {
  assert.deepEqual(CORRALIO_SPORTS, [
    "baseball", "softball", "soccer", "basketball", "volleyball",
    "hockey", "lacrosse", "football", "other",
  ]);
  assert.equal(parseCorralioSport(" Soccer "), "soccer");
  assert.equal(parseCorralioSport("curling"), null);
  assert.equal(parseCorralioSport(""), null);
  assert.equal(corralioSportLabel("volleyball"), "Volleyball");
  assert.equal(corralioSportIcon("softball"), "🥎");
});
