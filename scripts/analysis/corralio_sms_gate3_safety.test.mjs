import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PersistentSegmentLedger,
  validateSpikeConfig,
} from "./corralio_sms_telnyx_spike_safety.mjs";
import {
  ENUMERATION_SAFE_REQUEST_RESULT,
  Gate3SafetyError,
  TEST_ONLY_OTP_LIMITS,
  assertOtpRequestAllowed,
  assertOtpVerificationAllowed,
  assertTurnstileFixture,
  normalizeTestUsE164,
  runMockSendSmsHook,
  signStandardWebhookFixture,
  verifySupabaseSendSmsHookFixture,
} from "./corralio_sms_gate3_safety.mjs";

const syntheticEnvironment = {
  TELNYX_API_KEY: "synthetic-test-key",
  TELNYX_MESSAGING_PROFILE_ID: "11111111-1111-4111-8111-111111111111",
  TELNYX_PUBLIC_KEY: "11".repeat(32),
  TELNYX_PHONE_NUMBER: "+15555550100",
  CORRALIO_SMS_CHANNEL_HMAC_SECRET: Buffer.alloc(32, 9).toString("base64"),
  CORRALIO_SMS_TEST_ALLOWLIST: "+12065550101",
  CORRALIO_SMS_SEND_MODE: "test_allowlist",
  CORRALIO_SMS_TEST_DAILY_SEGMENT_LIMIT: "20",
  CORRALIO_SMS_TEST_DESTINATION_DAILY_SEGMENT_LIMIT: "5",
  CORRALIO_SMS_MAX_SEGMENTS_PER_MESSAGE: "1",
};

const serializedHookSecret = `v1,whsec_${Buffer.alloc(32, 8).toString("base64")}`;

function expectCode(fn, code) {
  assert.throws(fn, (error) => error instanceof Gate3SafetyError && error.code === code);
}

function signedHookFixture(overrides = {}) {
  const webhookId = overrides.webhookId ?? "hook-fixture-1";
  const timestamp = overrides.timestamp ?? "1788177600";
  const rawBody = overrides.rawBody ?? JSON.stringify({
    user: { phone: "+12065550101" },
    sms: { otp: "123456" },
  });
  return {
    rawBody,
    headers: {
      "webhook-id": webhookId,
      "webhook-timestamp": timestamp,
      "webhook-signature": signStandardWebhookFixture({
        rawBody,
        webhookId,
        timestamp,
        serializedSecret: serializedHookSecret,
      }),
    },
    serializedSecret: serializedHookSecret,
    nowSeconds: Number(timestamp),
    seenWebhookIds: new Set(),
  };
}

test("test geography accepts normalized U.S. E.164 and rejects malformed/unsupported input", () => {
  assert.equal(normalizeTestUsE164(" +12065550101 "), "+12065550101");
  expectCode(() => normalizeTestUsE164("206-555-0101"), "PHONE_INVALID");
  expectCode(() => normalizeTestUsE164("+442071838750"), "PHONE_GEOGRAPHY_UNSUPPORTED");
});

test("Turnstile fixture fails closed on missing, rejected, wrong-action, and wrong-host proofs", () => {
  const valid = {
    token: "synthetic-turnstile-token",
    result: { success: true, action: "corralio_phone_otp", hostname: "test.corralio.com" },
    expectedAction: "corralio_phone_otp",
    allowedHostnames: new Set(["test.corralio.com"]),
  };
  assert.deepEqual(assertTurnstileFixture(valid), { accepted: true });
  expectCode(() => assertTurnstileFixture({ ...valid, token: "" }), "TURNSTILE_PROOF_MISSING");
  expectCode(() => assertTurnstileFixture({ ...valid, result: { ...valid.result, success: false } }), "TURNSTILE_PROOF_REJECTED");
  expectCode(() => assertTurnstileFixture({ ...valid, result: { ...valid.result, action: "other" } }), "TURNSTILE_ACTION_MISMATCH");
  expectCode(() => assertTurnstileFixture({ ...valid, result: { ...valid.result, hostname: "other.example" } }), "TURNSTILE_HOSTNAME_MISMATCH");
});

test("test-only request policy enforces per-IP, per-phone, cooldown, and unavailable-state failures", () => {
  const allowed = {
    state: {
      available: true,
      ipRequestsInWindow: 0,
      phoneRequestsInWindow: 0,
      lastPhoneRequestAtSeconds: 0,
    },
    nowSeconds: 1000,
  };
  assert.deepEqual(assertOtpRequestAllowed(allowed), { allowed: true });
  expectCode(() => assertOtpRequestAllowed({ ...allowed, state: null }), "OTP_LIMIT_STATE_UNAVAILABLE");
  expectCode(() => assertOtpRequestAllowed({
    ...allowed,
    state: { ...allowed.state, ipRequestsInWindow: TEST_ONLY_OTP_LIMITS.requestsPerIpPerHour },
  }), "OTP_IP_LIMIT");
  expectCode(() => assertOtpRequestAllowed({
    ...allowed,
    state: { ...allowed.state, phoneRequestsInWindow: TEST_ONLY_OTP_LIMITS.requestsPerPhonePerHour },
  }), "OTP_PHONE_LIMIT");
  expectCode(() => assertOtpRequestAllowed({
    ...allowed,
    state: { ...allowed.state, lastPhoneRequestAtSeconds: 950 },
  }), "OTP_RESEND_COOLDOWN");
});

test("test-only verification policy enforces attempt state and limit", () => {
  assert.deepEqual(assertOtpVerificationAllowed({ state: { available: true, failedAttempts: 0 } }), { allowed: true });
  expectCode(() => assertOtpVerificationAllowed({ state: null }), "OTP_VERIFY_STATE_UNAVAILABLE");
  expectCode(() => assertOtpVerificationAllowed({
    state: { available: true, failedAttempts: TEST_ONLY_OTP_LIMITS.verificationAttemptsPerChallenge },
  }), "OTP_VERIFY_ATTEMPT_LIMIT");
});

test("Supabase Standard Webhook fixture verifies raw body and rejects authentication/replay failures", () => {
  const fixture = signedHookFixture();
  assert.deepEqual(verifySupabaseSendSmsHookFixture(fixture), {
    destination: "+12065550101",
    otp: "123456",
    webhookId: "hook-fixture-1",
  });
  expectCode(() => verifySupabaseSendSmsHookFixture(fixture), "SUPABASE_HOOK_REPLAY");
  expectCode(() => verifySupabaseSendSmsHookFixture({
    ...signedHookFixture(),
    headers: {},
  }), "SUPABASE_HOOK_HEADERS_MISSING");
  const badSignature = signedHookFixture();
  badSignature.headers["webhook-signature"] = "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  expectCode(() => verifySupabaseSendSmsHookFixture(badSignature), "SUPABASE_HOOK_SIGNATURE_INVALID");
  expectCode(() => verifySupabaseSendSmsHookFixture({
    ...signedHookFixture(),
    nowSeconds: 1788177901,
  }), "SUPABASE_HOOK_TIMESTAMP_STALE");
  const malformed = signedHookFixture({ rawBody: "{" });
  expectCode(() => verifySupabaseSendSmsHookFixture(malformed), "SUPABASE_HOOK_PAYLOAD_INVALID");
});

test("mock Send SMS Hook retains a reservation and propagates provider failure safely", async () => {
  const directory = await mkdtemp(join(tmpdir(), "corralio-gate3-ledger-"));
  try {
    const config = validateSpikeConfig(syntheticEnvironment);
    const ledger = new PersistentSegmentLedger({
      path: join(directory, "ledger.json"),
      hmacSecret: config.hmacSecret,
      dailyLimit: config.dailyLimit,
      destinationDailyLimit: config.destinationDailyLimit,
    });
    const verifiedHook = verifySupabaseSendSmsHookFixture(signedHookFixture());
    await assert.rejects(
      runMockSendSmsHook({
        verifiedHook,
        smsConfig: config,
        ledger,
        provider: { send: async () => { throw new Error("synthetic provider failure"); } },
      }),
      (error) => error instanceof Gate3SafetyError && error.code === "TELNYX_PROVIDER_UNAVAILABLE",
    );
    assert.deepEqual(await ledger.summary({
      destination: "+12065550101",
      now: new Date("2026-08-31T12:01:00.000Z"),
    }), { totalReserved: 1, destinationReserved: 1, reservationCount: 1 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("user-facing request result is enumeration-safe and contains no identifier", () => {
  assert.deepEqual(ENUMERATION_SAFE_REQUEST_RESULT, {
    ok: true,
    message: "If this phone can be used, a code will be sent.",
  });
  assert.doesNotMatch(JSON.stringify(ENUMERATION_SAFE_REQUEST_RESULT), /account exists|\+1\d|@/i);
});
