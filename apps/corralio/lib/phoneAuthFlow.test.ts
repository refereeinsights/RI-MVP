import assert from "node:assert/strict";
import test from "node:test";

import {
  requestPhoneChangeWithDependencies,
  requestPhoneOtpWithDependencies,
  verifyPhoneOtpWithDependencies,
} from "./phoneAuthFlow";

test("OTP request authorizes before Supabase and explicitly supports new users", async () => {
  const calls: string[] = [];
  const result = await requestPhoneOtpWithDependencies({
    phone: "509-555-0123",
    captchaToken: "captcha",
    async authorize() { calls.push("authorize"); return true; },
    async signInWithOtp(input) {
      calls.push("sign-in");
      assert.deepEqual(input, { phone: "+15095550123", captchaToken: "captcha", shouldCreateUser: true });
      return { error: null };
    },
  });
  assert.equal(result.status, "pending");
  assert.deepEqual(calls, ["authorize", "sign-in"]);
});

test("denied durable request never reaches Supabase", async () => {
  let called = false;
  const result = await requestPhoneOtpWithDependencies({
    phone: "+15095550123", captchaToken: "captcha",
    async authorize() { return false; },
    async signInWithOtp() { called = true; return { error: null }; },
  });
  assert.equal(result.status, "denied");
  assert.equal(called, false);
});

test("projection occurs only after server-confirmed phone verification and household provisioning", async () => {
  const calls: string[] = [];
  const result = await verifyPhoneOtpWithDependencies({
    submittedPhone: "+15095550123", token: "123456",
    async verify() {
      calls.push("verify");
      return { error: null, user: { id: "user", phone: "+15095550123", phoneConfirmedAt: "2026-09-03T00:00:00Z" } };
    },
    async ensureHousehold() { calls.push("household"); return "household"; },
    async project(input) {
      calls.push("project");
      assert.deepEqual(input, { userId: "user", householdId: "household", verifiedPhone: "+15095550123" });
    },
  });
  assert.equal(result.status, "verified");
  assert.deepEqual(calls, ["verify", "household", "project"]);
});

test("browser phone mismatch never reaches household or projection", async () => {
  let downstream = false;
  const result = await verifyPhoneOtpWithDependencies({
    submittedPhone: "+15095550123", token: "123456",
    async verify() { return { error: null, user: { id: "user", phone: "+15095550999", phoneConfirmedAt: "now" } }; },
    async ensureHousehold() { downstream = true; return "household"; },
    async project() { downstream = true; },
  });
  assert.equal(result.status, "denied");
  assert.equal(downstream, false);
});

test("phone change authorizes before asking Supabase to send its fresh OTP", async () => {
  const calls: string[] = [];
  const result = await requestPhoneChangeWithDependencies({
    phone: "509-555-0123",
    async authorize() { calls.push("authorize"); return true; },
    async updatePhone(phone) { calls.push(`update:${phone}`); return { error: null }; },
  });
  assert.equal(result.status, "pending");
  assert.deepEqual(calls, ["authorize", "update:+15095550123"]);
});

test("phone-change verification uses its dedicated Supabase OTP type", async () => {
  let type = "";
  const result = await verifyPhoneOtpWithDependencies({
    submittedPhone: "+15095550123", token: "123456", verificationType: "phone_change",
    async verify(input) {
      type = input.type;
      return { error: null, user: { id: "user", phone: input.phone, phoneConfirmedAt: "now" } };
    },
    async ensureHousehold() { return "household"; },
    async project() {},
  });
  assert.equal(result.status, "verified");
  assert.equal(type, "phone_change");
});
