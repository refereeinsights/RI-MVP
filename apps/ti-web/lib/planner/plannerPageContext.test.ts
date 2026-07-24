import test from "node:test";
import assert from "node:assert/strict";
import { canonicalPlannerPageTypeFromPath } from "./plannerPageContext";

test("plannerPageContext classifies canonical planner routes", () => {
  assert.equal(canonicalPlannerPageTypeFromPath("/tournaments/slug"), "tournament");
  assert.equal(canonicalPlannerPageTypeFromPath("/weekend/summer-classic"), "planner_entry");
  assert.equal(canonicalPlannerPageTypeFromPath("/weekend-planner"), "planner");
  assert.equal(canonicalPlannerPageTypeFromPath("/login"), "auth");
  assert.equal(canonicalPlannerPageTypeFromPath("/something-else"), "other");
});
