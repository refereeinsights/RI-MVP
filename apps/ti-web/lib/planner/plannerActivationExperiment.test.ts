import test from "node:test";
import assert from "node:assert/strict";
import {
  ANONYMOUS_PLANNER_ACTIVATION_EXPERIMENT,
  getPlannerActivationAssignment,
} from "./plannerActivationExperiment";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

function withEnv(overrides: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (typeof value === "undefined") delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (typeof value === "undefined") delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("planner activation experiment falls back to disabled control by default", () => {
  withEnv(
    {
      NEXT_PUBLIC_ENABLE_WEEKEND_PLANNER_DIRECT_ENTRY: undefined,
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ENABLED: undefined,
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ROLLOUT_PERCENT: undefined,
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_INCLUDE_AUTHENTICATED: undefined,
    },
    () => {
      const result = getPlannerActivationAssignment({
        plannerSessionId: SESSION_ID,
        authState: "signed_out",
      });
      assert.equal(result.experimentName, ANONYMOUS_PLANNER_ACTIVATION_EXPERIMENT);
      assert.equal(result.featureFlagState, "disabled");
      assert.equal(result.variant, "control");
      assert.equal(result.directEntryEnabled, false);
      assert.equal(result.anonymousPlannerEnabled, false);
    },
  );
});

test("planner activation experiment honors legacy direct-entry fallback", () => {
  withEnv(
    {
      NEXT_PUBLIC_ENABLE_WEEKEND_PLANNER_DIRECT_ENTRY: "true",
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ENABLED: undefined,
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ROLLOUT_PERCENT: undefined,
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_INCLUDE_AUTHENTICATED: undefined,
    },
    () => {
      const result = getPlannerActivationAssignment({
        plannerSessionId: SESSION_ID,
        authState: "signed_out",
      });
      assert.equal(result.featureFlagState, "enabled");
      assert.equal(result.variant, "treatment");
      assert.equal(result.directEntryEnabled, true);
      assert.equal(result.anonymousPlannerEnabled, true);
    },
  );
});

test("planner activation experiment uses legacy direct-entry as a hard treatment override", () => {
  withEnv(
    {
      NEXT_PUBLIC_ENABLE_WEEKEND_PLANNER_DIRECT_ENTRY: "true",
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ENABLED: "true",
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ROLLOUT_PERCENT: "0",
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_INCLUDE_AUTHENTICATED: "false",
    },
    () => {
      const result = getPlannerActivationAssignment({
        plannerSessionId: SESSION_ID,
        authState: "signed_out",
      });
      assert.equal(result.featureFlagState, "enabled");
      assert.equal(result.variant, "treatment");
      assert.equal(result.rolloutPercent, 100);
      assert.equal(result.directEntryEnabled, true);
      assert.equal(result.anonymousPlannerEnabled, true);
    },
  );
});

test("planner activation experiment assigns treatment for signed-out 100 percent rollout", () => {
  withEnv(
    {
      NEXT_PUBLIC_ENABLE_WEEKEND_PLANNER_DIRECT_ENTRY: "false",
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ENABLED: "true",
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ROLLOUT_PERCENT: "100",
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_INCLUDE_AUTHENTICATED: "false",
    },
    () => {
      const result = getPlannerActivationAssignment({
        plannerSessionId: SESSION_ID,
        authState: "signed_out",
      });
      assert.equal(result.featureFlagState, "enabled");
      assert.equal(result.variant, "treatment");
      assert.equal(result.directEntryEnabled, true);
      assert.equal(result.anonymousPlannerEnabled, true);
    },
  );
});

test("planner activation experiment can exclude authenticated traffic", () => {
  withEnv(
    {
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ENABLED: "true",
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ROLLOUT_PERCENT: "100",
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_INCLUDE_AUTHENTICATED: "false",
      NEXT_PUBLIC_ENABLE_WEEKEND_PLANNER_DIRECT_ENTRY: "false",
    },
    () => {
      const result = getPlannerActivationAssignment({
        plannerSessionId: SESSION_ID,
        authState: "verified",
      });
      assert.equal(result.featureFlagState, "enabled");
      assert.equal(result.variant, "control");
      assert.equal(result.directEntryEnabled, false);
      assert.equal(result.anonymousPlannerEnabled, false);
    },
  );
});

test("planner activation experiment preserves a locked treatment assignment after rollback", () => {
  withEnv(
    {
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ENABLED: "false",
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ROLLOUT_PERCENT: "0",
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_INCLUDE_AUTHENTICATED: "false",
      NEXT_PUBLIC_ENABLE_WEEKEND_PLANNER_DIRECT_ENTRY: "false",
    },
    () => {
      const result = getPlannerActivationAssignment({
        plannerSessionId: SESSION_ID,
        authState: "signed_out",
        lockedVariant: "treatment",
        lockedFeatureFlagState: "enabled",
      });
      assert.equal(result.featureFlagState, "enabled");
      assert.equal(result.variant, "treatment");
      assert.equal(result.directEntryEnabled, true);
      assert.equal(result.anonymousPlannerEnabled, true);
    },
  );
});

test("planner activation experiment preserves a locked control assignment", () => {
  withEnv(
    {
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ENABLED: "true",
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_ROLLOUT_PERCENT: "100",
      NEXT_PUBLIC_ANONYMOUS_PLANNER_ACTIVATION_V1_INCLUDE_AUTHENTICATED: "true",
      NEXT_PUBLIC_ENABLE_WEEKEND_PLANNER_DIRECT_ENTRY: "false",
    },
    () => {
      const result = getPlannerActivationAssignment({
        plannerSessionId: SESSION_ID,
        authState: "signed_out",
        lockedVariant: "control",
        lockedFeatureFlagState: "enabled",
      });
      assert.equal(result.featureFlagState, "enabled");
      assert.equal(result.variant, "control");
      assert.equal(result.directEntryEnabled, false);
      assert.equal(result.anonymousPlannerEnabled, false);
    },
  );
});
