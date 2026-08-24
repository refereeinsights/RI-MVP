import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildActivePlanningEventSourceFilter } from "./activePlanning";

const SOURCE_A = "cb440000-0000-4000-8000-000000000001";
const SOURCE_B = "cb440000-0000-4000-8000-000000000002";

test("active planning keeps manual events and only listed active sources", () => {
  assert.equal(buildActivePlanningEventSourceFilter([]), null);
  assert.equal(
    buildActivePlanningEventSourceFilter([SOURCE_A, SOURCE_B]),
    `schedule_source_id.is.null,schedule_source_id.in.(${SOURCE_A},${SOURCE_B})`,
  );
  assert.throws(() => buildActivePlanningEventSourceFilter(["not-a-uuid"]));
});

test("the database predicate is applied before event ordering and the 200-row limit", () => {
  const productData = readFileSync(new URL("../app/_lib/productData.ts", import.meta.url), "utf8");
  const eventLoader = productData.slice(
    productData.indexOf("async function loadWeekendEventRows"),
    productData.indexOf("export async function loadWeekendData"),
  );
  const predicatePosition = Math.max(eventLoader.indexOf("query.or(sourceFilter)"), eventLoader.indexOf('query.is("schedule_source_id", null)'));
  const orderPosition = eventLoader.indexOf('.order("starts_at"');
  const limitPosition = eventLoader.indexOf(".limit(200)");
  assert.ok(predicatePosition > 0 && predicatePosition < orderPosition);
  assert.ok(orderPosition > 0 && orderPosition < limitPosition);
  assert.doesNotMatch(eventLoader, /\.filter\(/);
});
