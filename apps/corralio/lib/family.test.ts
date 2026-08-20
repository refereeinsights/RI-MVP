import assert from "node:assert/strict";
import test from "node:test";

import {
  CORRALIO_CHILD_COLORS,
  nextChildColor,
  normalizeFamilyName,
  parseChildColor,
  parseTeamSport,
} from "./family";

test("child colors cycle through the existing six persisted tokens", () => {
  assert.deepEqual(CORRALIO_CHILD_COLORS, ["forest", "ocean", "amber", "violet", "rose", "teal"]);
  assert.equal(nextChildColor([]), "forest");
  assert.equal(nextChildColor(["forest", "ocean", "amber", "violet", "rose", "teal"]), "forest");
  assert.equal(nextChildColor(["forest", "forest"]), "amber");
  assert.equal(parseChildColor(" Rose "), "rose");
  assert.equal(parseChildColor("unknown"), "forest");
});

test("family names are trimmed and bounded", () => {
  assert.equal(normalizeFamilyName("  Avery  ", 80), "Avery");
  assert.equal(normalizeFamilyName("   ", 80), null);
  assert.equal(normalizeFamilyName("a".repeat(81), 80), null);
  assert.equal(normalizeFamilyName("a".repeat(80), 80), "a".repeat(80));
});

test("team sport accepts only the canonical taxonomy or an empty value", () => {
  assert.equal(parseTeamSport(" Soccer "), "soccer");
  assert.equal(parseTeamSport(" Tennis "), "tennis");
  assert.equal(parseTeamSport("Track_Field"), "track_field");
  assert.equal(parseTeamSport(""), null);
  assert.equal(parseTeamSport("curling"), undefined);
});
