import assert from "node:assert/strict";
import test from "node:test";

import { estimatedLeaveByIso } from "./leaveBy";
import {
  parseArrivalPreferenceInput,
  resolveRequiredArrival,
  type RequiredArrivalInput,
} from "./requiredArrival";

const input = (overrides: Partial<RequiredArrivalInput> = {}): RequiredArrivalInput => ({
  startsAt: "2026-09-10T18:00:00.000Z",
  scheduleArrivalAt: null,
  sourceArrivalMinutes: null,
  teamArrivalMinutes: null,
  ...overrides,
});

test("shared required-arrival resolver uses all four tiers with typed provenance", () => {
  assert.deepEqual(resolveRequiredArrival(input({
    scheduleArrivalAt: "2026-09-10T17:10:00.000Z",
    sourceArrivalMinutes: 45,
    teamArrivalMinutes: 60,
  })), {
    requiredArrivalAt: "2026-09-10T17:10:00.000Z",
    source: "ics_explicit",
    minutes: 50,
  });
  assert.deepEqual(resolveRequiredArrival(input({ sourceArrivalMinutes: 45, teamArrivalMinutes: 60 })), {
    requiredArrivalAt: "2026-09-10T17:15:00.000Z",
    source: "source_preference",
    minutes: 45,
  });
  assert.deepEqual(resolveRequiredArrival(input({ teamArrivalMinutes: 60 })), {
    requiredArrivalAt: "2026-09-10T17:00:00.000Z",
    source: "team_preference",
    minutes: 60,
  });
  assert.deepEqual(resolveRequiredArrival(input()), {
    requiredArrivalAt: "2026-09-10T17:30:00.000Z",
    source: "corralio_default",
    minutes: 30,
  });
});

test("invalid explicit and preference inputs fall through deterministically", () => {
  assert.equal(resolveRequiredArrival(input({
    scheduleArrivalAt: "2026-09-10T14:00:00.000Z",
    sourceArrivalMinutes: 43,
    teamArrivalMinutes: 35,
  }))?.source, "team_preference");
  assert.equal(resolveRequiredArrival(input({ startsAt: "invalid" })), null);
});

test("source preference supports assigned and unassigned events without changing precedence", () => {
  const assigned = resolveRequiredArrival(input({ sourceArrivalMinutes: 25, teamArrivalMinutes: 55 }));
  const unassigned = resolveRequiredArrival(input({ sourceArrivalMinutes: 25, teamArrivalMinutes: null }));
  assert.deepEqual(assigned, unassigned);
  assert.equal(assigned?.source, "source_preference");
});

test("clearing source preference restores team or default behavior", () => {
  assert.equal(resolveRequiredArrival(input({ sourceArrivalMinutes: null, teamArrivalMinutes: 50 }))?.source, "team_preference");
  assert.equal(resolveRequiredArrival(input({ sourceArrivalMinutes: null, teamArrivalMinutes: null }))?.source, "corralio_default");
});

test("source preference parser enforces nullable 0-120 five-minute values", () => {
  assert.deepEqual(parseArrivalPreferenceInput(""), { ok: true, value: null });
  assert.deepEqual(parseArrivalPreferenceInput("0"), { ok: true, value: 0 });
  assert.deepEqual(parseArrivalPreferenceInput("120"), { ok: true, value: 120 });
  for (const value of ["-5", "43", "125", "5.5", 30, null]) {
    assert.deepEqual(parseArrivalPreferenceInput(value), { ok: false });
  }
});

test("leave-by subtracts drive duration from the shared resolved arrival", () => {
  const arrival = resolveRequiredArrival(input({ sourceArrivalMinutes: 45 }));
  assert.ok(arrival);
  assert.equal(
    estimatedLeaveByIso(arrival.requiredArrivalAt, 20),
    "2026-09-10T16:55:00.000Z",
  );
});
