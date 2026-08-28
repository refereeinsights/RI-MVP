import assert from "node:assert/strict";
import test from "node:test";

import {
  householdTimezoneLabel,
  isWeekendReadyLocalSendWindow,
  parseIanaTimeZone,
  planningWeekendStart,
} from "./householdTimezone";

test("accepts canonical IANA zones and rejects offsets or malformed values", () => {
  assert.equal(parseIanaTimeZone("America/Los_Angeles"), "America/Los_Angeles");
  assert.equal(parseIanaTimeZone("America/New_York"), "America/New_York");
  assert.equal(parseIanaTimeZone("UTC-8"), null);
  assert.equal(parseIanaTimeZone("GMT+2"), null);
  assert.equal(parseIanaTimeZone("Pacific Time"), null);
  assert.equal(parseIanaTimeZone("not/a real zone"), null);
});

test("uses only a confirmed stored zone for eligibility", () => {
  const now = new Date("2026-08-27T23:40:00Z");
  assert.equal(isWeekendReadyLocalSendWindow({ now, householdTimezone: null }), false);
  assert.equal(isWeekendReadyLocalSendWindow({ now, householdTimezone: "America/Los_Angeles" }), true);
  assert.equal(isWeekendReadyLocalSendWindow({ now, householdTimezone: "America/New_York" }), false);
  assert.equal(planningWeekendStart({ now, householdTimezone: "America/Los_Angeles" }), "2026-08-28");
});

test("applies IANA DST rules at the same household-local send time", () => {
  assert.equal(isWeekendReadyLocalSendWindow({
    now: new Date("2026-08-27T23:40:00Z"),
    householdTimezone: "America/Los_Angeles",
  }), true);
  assert.equal(isWeekendReadyLocalSendWindow({
    now: new Date("2026-12-11T00:40:00Z"),
    householdTimezone: "America/Los_Angeles",
  }), true);
  assert.equal(isWeekendReadyLocalSendWindow({
    now: new Date("2026-08-27T20:40:00Z"),
    householdTimezone: "America/New_York",
  }), true);
  assert.equal(isWeekendReadyLocalSendWindow({
    now: new Date("2026-12-10T21:40:00Z"),
    householdTimezone: "America/New_York",
  }), true);
});

test("keeps presentation labels separate from canonical stored values", () => {
  assert.equal(householdTimezoneLabel("America/Chicago"), "Central Time");
  assert.equal(householdTimezoneLabel("America/Indiana/Indianapolis"), "Indianapolis");
});
