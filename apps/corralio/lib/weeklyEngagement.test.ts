import assert from "node:assert/strict";
import test from "node:test";

import {
  WEEKLY_ENGAGEMENT_FAILURE_LOG,
  recordWeeklyEngagement,
  type EngagementPayload,
} from "./weeklyEngagement";

const PAYLOAD: EngagementPayload = {
  hadConflict: true,
  conflictCount: 2,
  conflictCheckUnavailable: false,
};

test("calls the RPC once with only the resolved viewer and sanitized payload", async () => {
  const viewer = { householdId: "household-1", supabase: "client" };
  const calls: unknown[][] = [];
  const logs: string[] = [];

  await recordWeeklyEngagement(
    {
      resolveViewer: async () => viewer,
      callRpc: async (...args) => {
        calls.push(args);
        return { error: null };
      },
      log: (message) => logs.push(message),
    },
    PAYLOAD,
  );

  assert.deepEqual(calls, [[viewer, PAYLOAD]]);
  assert.deepEqual(logs, []);
});

test("logs one constant line and does not throw for a resolved RPC error", async () => {
  const logs: string[] = [];
  await assert.doesNotReject(
    recordWeeklyEngagement(
      {
        resolveViewer: async () => ({ householdId: "household-1" }),
        callRpc: async () => ({ error: { private: "not logged" } }),
        log: (message) => logs.push(message),
      },
      PAYLOAD,
    ),
  );
  assert.deepEqual(logs, [WEEKLY_ENGAGEMENT_FAILURE_LOG]);
});

test("logs one constant line and does not throw when the RPC rejects", async () => {
  const logs: string[] = [];
  await assert.doesNotReject(
    recordWeeklyEngagement(
      {
        resolveViewer: async () => ({ householdId: "household-1" }),
        callRpc: async () => {
          throw new Error("private RPC details");
        },
        log: (message) => logs.push(message),
      },
      PAYLOAD,
    ),
  );
  assert.deepEqual(logs, [WEEKLY_ENGAGEMENT_FAILURE_LOG]);
});

test("exercises the catch path with a rejecting viewer fake", async () => {
  const logs: string[] = [];
  let rpcCalls = 0;
  await assert.doesNotReject(
    recordWeeklyEngagement(
      {
        resolveViewer: async (): Promise<{ householdId: string } | null> => {
          throw new Error("fake viewer failure");
        },
        callRpc: async () => {
          rpcCalls += 1;
          return { error: null };
        },
        log: (message) => logs.push(message),
      },
      PAYLOAD,
    ),
  );
  assert.equal(rpcCalls, 0);
  assert.deepEqual(logs, [WEEKLY_ENGAGEMENT_FAILURE_LOG]);
});

test("does nothing when the viewer or household is absent", async () => {
  for (const viewer of [null, { householdId: null }]) {
    let rpcCalls = 0;
    const logs: string[] = [];
    await recordWeeklyEngagement(
      {
        resolveViewer: async () => viewer,
        callRpc: async () => {
          rpcCalls += 1;
          return { error: null };
        },
        log: (message) => logs.push(message),
      },
      PAYLOAD,
    );
    assert.equal(rpcCalls, 0);
    assert.deepEqual(logs, []);
  }
});

test("swallows a logger failure so telemetry cannot break the planner", async () => {
  await assert.doesNotReject(
    recordWeeklyEngagement(
      {
        resolveViewer: async () => ({ householdId: "household-1" }),
        callRpc: async () => ({ error: true }),
        log: () => {
          throw new Error("logger unavailable");
        },
      },
      PAYLOAD,
    ),
  );
});
