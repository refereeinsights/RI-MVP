import assert from "node:assert/strict";
import test from "node:test";

import { resolveDeterministicIntakeAssignment, SMS_ASSIGNMENT_RULE_VERSION } from "./intakeAssignment";

const target = { teamId: "team-1", childId: "child-1", teamName: "Spokane Select", childName: "Jake" };

test("assignment requires exact CALNAME plus exact full-team event evidence", () => {
  assert.deepEqual(resolveDeterministicIntakeAssignment({
    calendarName: "Spokane Select",
    eventTitles: ["Spokane Select vs Mead"],
  }, [target]), { outcome: "assigned", target, ruleVersion: SMS_ASSIGNMENT_RULE_VERSION });
});

test("CALNAME alone, fuzzy titles, conflicts, and duplicate same-sport teams all clarify", () => {
  assert.equal(resolveDeterministicIntakeAssignment({ calendarName: "Spokane Select", eventTitles: ["Game"] }, [target]).outcome, "clarification_required");
  assert.equal(resolveDeterministicIntakeAssignment({ calendarName: null, eventTitles: ["Spokane Select"] }, [target]).outcome, "clarification_required");
  assert.equal(resolveDeterministicIntakeAssignment({ calendarName: "Spokane Select", eventTitles: ["Select game"] }, [target]).outcome, "clarification_required");
  assert.equal(resolveDeterministicIntakeAssignment(
    { calendarName: "Spokane Select", eventTitles: ["Spokane Select game"] },
    [target, { ...target, teamId: "team-2" }],
  ).outcome, "clarification_required");
});

test("vendor-generic and ambiguous calendar evidence cannot assign or write identity", () => {
  const vendorGeneric = resolveDeterministicIntakeAssignment({
    calendarName: "ArbiterSports",
    eventTitles: ["ArbiterSports game"],
  }, [target]);
  assert.equal(vendorGeneric.outcome, "clarification_required");

  const ambiguous = resolveDeterministicIntakeAssignment({
    calendarName: "Spokane Select",
    eventTitles: ["Spokane Select vs Mead"],
  }, [target, { ...target, teamId: "team-2", childId: "child-2", childName: "Alex" }]);
  assert.equal(ambiguous.outcome, "clarification_required");
  assert.deepEqual(Object.keys(ambiguous).sort(), ["outcome", "ruleVersion"]);
});
