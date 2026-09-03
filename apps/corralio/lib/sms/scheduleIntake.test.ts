import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { processSmsScheduleIntake, type SmsScheduleIntakeDependencies } from "./scheduleIntake";

test("server inspection threads the shared parser calendar name without reimplementing inference", () => {
  const source = readFileSync(new URL("./scheduleIntake.server.ts", import.meta.url), "utf8");
  assert.match(source, /calendarName:\s*normalized\.calendarName\s*\?\?\s*null/);
  assert.doesNotMatch(source, /calendarName:\s*null/);
});

function dependencies(overrides: Partial<SmsScheduleIntakeDependencies> = {}) {
  const calls: string[] = [];
  const base: SmsScheduleIntakeDependencies = {
    async claimEvent() { calls.push("claim"); return "claimed"; },
    async completeEvent(_id, outcome) { calls.push(`complete:${outcome}`); },
    async resolveOwner() { calls.push("resolve"); return { userId: "user", householdId: "household" }; },
    async listTargets() { calls.push("targets"); return [{ teamId: "team", childId: "child", teamName: "Spokane Select", childName: "Jake" }]; },
    async inspect() { calls.push("inspect"); return { ok: true, evidence: { calendarName: null, eventTitles: ["Game"] } }; },
    async connect() { calls.push("connect"); return { ok: true, sourceId: "source" }; },
    async createPending() { calls.push("pending"); return { created: true }; },
    async claimPending() { calls.push("claim-pending"); return null; },
    async finalizePending() { calls.push("finalize"); },
    async cancelPending() { calls.push("cancel"); return true; },
    async sendReply() { calls.push("reply"); },
  };
  return { calls, value: { ...base, ...overrides } };
}

test("unknown sender is rejected before URL inspection or retrieval", async () => {
  const state = dependencies({ async resolveOwner() { state.calls.push("resolve"); return null; } });
  const result = await processSmsScheduleIntake(state.value, {
    eventId: "event", senderPhone: "+15095550123", text: "https://example.invalid/private.ics",
  });
  assert.equal(result.status, "ignored");
  assert.deepEqual(state.calls, ["claim", "resolve", "complete:ignored"]);
});

test("missing corroborating evidence creates one pending clarification and never connects unassigned", async () => {
  const state = dependencies();
  const result = await processSmsScheduleIntake(state.value, {
    eventId: "event", senderPhone: "+15095550123", text: "https://example.invalid/private.ics",
  });
  assert.equal(result.status, "clarification_pending");
  assert.deepEqual(state.calls, ["claim", "resolve", "targets", "inspect", "pending", "complete:clarification_pending", "reply"]);
  assert.equal(state.calls.includes("connect"), false);
});

test("unique versioned exact evidence connects through the shared core", async () => {
  const state = dependencies({
    async inspect() {
      state.calls.push("inspect");
      return { ok: true, evidence: { calendarName: "Spokane Select", eventTitles: ["Spokane Select vs Mead"] } };
    },
  });
  const result = await processSmsScheduleIntake(state.value, {
    eventId: "event", senderPhone: "+15095550123", text: "https://example.invalid/private.ics",
  });
  assert.equal(result.status, "connected");
  assert.deepEqual(state.calls, ["claim", "resolve", "targets", "inspect", "connect", "complete:connected", "reply"]);
});

test("duplicate webhook does not resolve, fetch, persist, or reply", async () => {
  const state = dependencies({ async claimEvent() { state.calls.push("claim"); return "duplicate"; } });
  const result = await processSmsScheduleIntake(state.value, {
    eventId: "event", senderPhone: "+15095550123", text: "https://example.invalid/private.ics",
  });
  assert.equal(result.status, "duplicate");
  assert.deepEqual(state.calls, ["claim"]);
});

test("bounded numeric reply claims, decrypts upstream, connects, and terminally finalizes", async () => {
  const state = dependencies({
    async claimPending() {
      state.calls.push("claim-pending");
      return { intakeId: "pending", url: "https://example.invalid/private.ics", assignment: { childId: "child", teamId: "team" } };
    },
  });
  const result = await processSmsScheduleIntake(state.value, {
    eventId: "event", senderPhone: "+15095550123", text: "1",
  });
  assert.equal(result.status, "resolved");
  assert.deepEqual(state.calls, ["claim", "resolve", "claim-pending", "connect", "finalize", "complete:resolved", "reply"]);
});
