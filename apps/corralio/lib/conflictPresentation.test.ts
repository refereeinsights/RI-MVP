import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../app/components/ThisWeekend.tsx", import.meta.url), "utf8");
const productData = readFileSync(new URL("../app/_lib/productData.ts", import.meta.url), "utf8");

test("This Weekend derives conflicts from the shared exact-weekend plan", () => {
  assert.match(component, /buildWeekendPlan\(events, now, candidateLimitReached\)/);
  assert.match(component, /"conflict" : "conflicts"} this weekend/);
  assert.match(component, /Same child conflict/);
  assert.match(component, /Schedule conflict/);
  assert.match(component, /Overlap:/);
});

test("the candidate cap disables definitive conflict claims without hiding events", () => {
  assert.match(productData, /candidateLimitReached: events\.length === WEEKEND_CANDIDATE_LIMIT/);
  assert.match(component, /conflictStatus === "candidate-limit-reached"/);
  assert.match(component, /Conflict check unavailable/);
  assert.match(component, /weekend events are still shown below/);
});

test("conflict presentation receives no source URL", () => {
  const eventProjection = productData.slice(
    productData.indexOf("type EventRow"),
    productData.indexOf("export async function loadFamilyData"),
  );
  assert.doesNotMatch(eventProjection, /source_url/);
  assert.doesNotMatch(component, /source_url|sourceUrl/);
});
