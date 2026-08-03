import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_STATES_VALUE,
  buildMonthRange,
  monthOptions,
  normalizeSportParam,
  parseStateSelections,
  parseToggle,
  sportLabelFromParam,
} from "./filters";

test("normalizeSportParam normalizes casing and dashes", () => {
  assert.equal(normalizeSportParam("Girls-Basketball "), "girls basketball");
});

test("sportLabelFromParam title-cases normalized sport names", () => {
  assert.equal(sportLabelFromParam("boys-lacrosse"), "Boys Lacrosse");
});

test("parseToggle supports string and array boolean values", () => {
  assert.equal(parseToggle("true"), true);
  assert.equal(parseToggle(["false", "1"]), true);
  assert.equal(parseToggle("0"), false);
});

test("parseStateSelections handles all states sentinel", () => {
  const parsed = parseStateSelections(["ca", ALL_STATES_VALUE, "tx"]);
  assert.deepEqual(parsed.selections, ["CA", "TX"]);
  assert.equal(parsed.isAllStates, true);
  assert.equal(parsed.summaryLabel, "All states");
});

test("parseStateSelections summarizes explicit state picks", () => {
  const parsed = parseStateSelections(["ca", "az"]);
  assert.deepEqual(parsed.selections, ["CA", "AZ"]);
  assert.equal(parsed.isAllStates, false);
  assert.equal(parsed.summaryLabel, "CA, AZ");
});

test("buildMonthRange returns inclusive start and exclusive end boundaries", () => {
  assert.deepEqual(buildMonthRange("2026-08"), {
    startISO: "2026-08-01",
    endISO: "2026-09-01",
  });
  assert.equal(buildMonthRange("2026-8"), null);
});

test("monthOptions is deterministic from a provided date", () => {
  const options = monthOptions(2, new Date("2026-08-15T12:00:00Z"));
  assert.deepEqual(options, [
    { value: "2026-08", label: "August 2026" },
    { value: "2026-09", label: "September 2026" },
  ]);
});
