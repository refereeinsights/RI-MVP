import test from "node:test";
import assert from "node:assert/strict";
import { canUseCorePrivatePlanner } from "./entitlements";

test("core private planner access allows authenticated unverified users", () => {
  assert.equal(
    canUseCorePrivatePlanner({
      tier: "explorer",
      unverified: true,
      isAuthenticated: true,
    }),
    true,
  );
});

test("core private planner access allows authenticated verified free users", () => {
  assert.equal(
    canUseCorePrivatePlanner({
      tier: "insider",
      unverified: false,
      isAuthenticated: true,
    }),
    true,
  );
});

test("core private planner access blocks signed-out users and verified explorers", () => {
  assert.equal(
    canUseCorePrivatePlanner({
      tier: "explorer",
      unverified: false,
      isAuthenticated: false,
    }),
    false,
  );
  assert.equal(
    canUseCorePrivatePlanner({
      tier: "explorer",
      unverified: false,
      isAuthenticated: true,
    }),
    false,
  );
});
