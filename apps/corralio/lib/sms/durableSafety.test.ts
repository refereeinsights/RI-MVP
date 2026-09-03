import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  authorizeSmsOtpRequest,
  countGsm7Segments,
  deriveSmsSafetyHmac,
  handleVerifiedSmsHook,
  normalizeSmsPhone,
  normalizeTrustedIp,
  type SmsPreAuthorizationFailureCategory,
  type SmsDurableSafetyGateway,
  type SmsSafetyDecision,
} from "./durableSafety";

const HMAC_SECRET = "gate3-test-hmac-secret-is-at-least-thirty-two-bytes";
const WEBHOOK_KEY_TEXT = "gate3-standard-webhook-fixture-key";
const WEBHOOK_KEY = Buffer.from(WEBHOOK_KEY_TEXT).toString("base64");
const NOW = 1_788_150_000;

function signedHook(input: { id?: string; phone?: string; otp?: string } = {}) {
  const webhookId = input.id ?? "gate3_hook_1";
  const rawBody = JSON.stringify({
    user: { phone: input.phone ?? "+15095550123" },
    sms: { otp: input.otp ?? "123456" },
  });
  const timestamp = String(NOW);
  const signature = createHmac("sha256", WEBHOOK_KEY_TEXT)
    .update(`${webhookId}.${timestamp}.${rawBody}`).digest("base64");
  return {
    rawBody,
    headers: new Headers({
      "webhook-id": webhookId,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${signature}`,
    }),
  };
}

function gateway(input: {
  request?: SmsSafetyDecision;
  hook?: SmsSafetyDecision;
  onHook?: () => void;
} = {}): SmsDurableSafetyGateway {
  return {
    async authorizeOtpRequest() { return input.request ?? "authorized"; },
    async authorizeHookAttempt() { input.onHook?.(); return input.hook ?? "authorized"; },
  };
}

test("normalizes canonical phone/IP values and domain-separates HMAC identities", () => {
  assert.equal(normalizeSmsPhone("(509) 555-0123"), "+15095550123");
  assert.equal(normalizeTrustedIp("192.168.001.010"), "192.168.1.10");
  assert.equal(normalizeTrustedIp("2001:0db8:0:0:0:0:0:1"), "2001:db8::1");
  const destination = deriveSmsSafetyHmac(HMAC_SECRET, "destination", "+15095550123");
  const ip = deriveSmsSafetyHmac(HMAC_SECRET, "ip", "+15095550123");
  assert.match(destination, /^[0-9a-f]{64}$/);
  assert.notEqual(destination, ip);
});

test("missing HMAC secret and absent trusted Vercel evidence fail closed", async () => {
  const base = new Request("https://corralio.test/sms", {
    method: "POST",
    headers: { origin: "https://corralio.test", "sec-fetch-site": "same-origin", "x-vercel-forwarded-for": "203.0.113.7" },
  });
  assert.deepEqual(await authorizeSmsOtpRequest({
    request: base, expectedOrigin: "https://corralio.test", phone: "+15095550123",
    hmacSecret: undefined, gateway: gateway(), isVercelRuntime: true,
  }), { status: "denied" });
  assert.deepEqual(await authorizeSmsOtpRequest({
    request: base, expectedOrigin: "https://corralio.test", phone: "+15095550123",
    hmacSecret: HMAC_SECRET, gateway: gateway(), isVercelRuntime: false,
  }), { status: "denied" });
});

test("request authorization returns only a bounded browser result", async () => {
  const request = new Request("https://corralio.test/sms", {
    method: "POST",
    headers: { origin: "https://corralio.test", "sec-fetch-site": "same-origin", "x-vercel-forwarded-for": "203.0.113.8" },
  });
  for (const decision of ["authorized", "policy_disabled", "invalid_mode", "not_allowlisted", "rate_limited", "cooldown"] as const) {
    const result = await authorizeSmsOtpRequest({
      request, expectedOrigin: "https://corralio.test", phone: "+15095550123",
      hmacSecret: HMAC_SECRET, gateway: gateway({ request: decision }), isVercelRuntime: true,
    });
    assert.deepEqual(result, decision === "authorized" ? { status: "authorized" } : { status: "denied" });
    assert.deepEqual(Object.keys(result), ["status"]);
  }
});

test("pre-authorization failures return only bounded categories and never reach durable authorization or provider", async () => {
  let databaseCalls = 0;
  let providerCalls = 0;
  const fixtures: Array<{
    category: SmsPreAuthorizationFailureCategory;
    hook: ReturnType<typeof signedHook>;
    secret?: string;
    mutate?: (headers: Headers) => void;
    rawBody?: string;
  }> = [
    { category: "hook_secret_unavailable", hook: signedHook(), secret: undefined },
    { category: "header_contract_invalid", hook: { ...signedHook(), headers: new Headers() }, secret: `v1,whsec_${WEBHOOK_KEY}` },
    { category: "timestamp_invalid", hook: signedHook(), secret: `v1,whsec_${WEBHOOK_KEY}`, mutate: (headers: Headers) => headers.set("webhook-timestamp", String(NOW - 301)) },
    { category: "signature_mismatch", hook: signedHook(), secret: `v1,whsec_${WEBHOOK_KEY}`, mutate: (headers: Headers) => headers.set("webhook-signature", "v1,invalid") },
    { category: "payload_json_invalid", hook: signedHook(), secret: `v1,whsec_${WEBHOOK_KEY}`, rawBody: "{" },
    { category: "payload_shape_invalid", hook: signedHook(), secret: `v1,whsec_${WEBHOOK_KEY}`, rawBody: JSON.stringify({ user: {}, sms: {} }) },
    { category: "phone_invalid", hook: signedHook(), secret: `v1,whsec_${WEBHOOK_KEY}`, rawBody: JSON.stringify({ user: { phone: "invalid" }, sms: { otp: "123456" } }) },
    { category: "otp_invalid", hook: signedHook(), secret: `v1,whsec_${WEBHOOK_KEY}`, rawBody: JSON.stringify({ user: { phone: "+15095550123" }, sms: { otp: "not-an-otp" } }) },
  ];
  for (const fixture of fixtures) {
    fixture.mutate?.(fixture.hook.headers);
    const rawBody = fixture.rawBody ?? fixture.hook.rawBody;
    const timestamp = fixture.hook.headers.get("webhook-timestamp") ?? String(NOW);
    const webhookId = fixture.hook.headers.get("webhook-id") ?? "gate3_hook_1";
    if (fixture.rawBody !== undefined) {
      const signature = createHmac("sha256", WEBHOOK_KEY_TEXT)
        .update(`${webhookId}.${timestamp}.${rawBody}`).digest("base64");
      fixture.hook.headers.set("webhook-signature", `v1,${signature}`);
    }
    const result = await handleVerifiedSmsHook({
      rawBody, headers: fixture.hook.headers, webhookSecret: fixture.secret, hmacSecret: HMAC_SECRET, nowSeconds: NOW,
      gateway: gateway({ onHook: () => { databaseCalls += 1; } }),
      provider: { async send() { providerCalls += 1; return { outcome: "accepted" }; } },
    });
    assert.deepEqual(result, {
      status: "denied", decision: "blocked", failureClass: "terminal",
      preAuthorizationCategory: fixture.category,
    });
  }
  assert.equal(databaseCalls, 0);
  assert.equal(providerCalls, 0);
});

test("direct, expired, duplicate, caps, allowlist, policy and segment denials never call provider", async () => {
  for (const decision of [
    "missing_permit", "expired_permit", "duplicate", "global_cap", "destination_cap",
    "not_allowlisted", "policy_disabled", "invalid_mode", "segment_limit", "blocked",
  ] as const) {
    let providerCalls = 0;
    const result = await handleVerifiedSmsHook({
      ...signedHook({ id: `hook_${decision}` }), webhookSecret: `v1,whsec_${WEBHOOK_KEY}`,
      hmacSecret: HMAC_SECRET, nowSeconds: NOW, gateway: gateway({ hook: decision }),
      provider: { async send() { providerCalls += 1; return { outcome: "accepted" }; } },
    });
    assert.deepEqual(result, { status: "denied", decision, failureClass: "terminal" });
    assert.equal(providerCalls, 0);
  }
});

test("one authorized hook makes exactly one mock provider attempt", async () => {
  let calls = 0;
  const result = await handleVerifiedSmsHook({
    ...signedHook(), webhookSecret: `v1,whsec_${WEBHOOK_KEY}`, hmacSecret: HMAC_SECRET,
    nowSeconds: NOW, gateway: gateway(),
    provider: { async send(input) { calls += 1; assert.match(input.message, /^Your Corralio verification code is \d{6}\.$/); return { outcome: "accepted" }; } },
  });
  assert.deepEqual(result, { status: "attempted", decision: "authorized", providerOutcome: "accepted" });
  assert.equal(calls, 1);
});

test("provider rejection and timeout never trigger retry or release behavior", async () => {
  let rejectedCalls = 0;
  const rejected = await handleVerifiedSmsHook({
    ...signedHook({ id: "hook_rejected" }), webhookSecret: `v1,whsec_${WEBHOOK_KEY}`,
    hmacSecret: HMAC_SECRET, nowSeconds: NOW, gateway: gateway(),
    provider: { async send() { rejectedCalls += 1; return { outcome: "rejected" }; } },
  });
  assert.deepEqual(rejected, { status: "attempted", decision: "authorized", providerOutcome: "rejected" });
  assert.equal(rejectedCalls, 1);

  let timeoutCalls = 0;
  const timeout = await handleVerifiedSmsHook({
    ...signedHook({ id: "hook_timeout" }), webhookSecret: `v1,whsec_${WEBHOOK_KEY}`,
    hmacSecret: HMAC_SECRET, nowSeconds: NOW, gateway: gateway(),
    provider: { async send() { timeoutCalls += 1; throw new Error("fixture timeout"); } },
  });
  assert.deepEqual(timeout, { status: "attempted", decision: "authorized", providerOutcome: "unknown" });
  assert.equal(timeoutCalls, 1);
});

test("database failure blocks the provider", async () => {
  let calls = 0;
  const broken: SmsDurableSafetyGateway = {
    async authorizeOtpRequest() { throw new Error("fixture unavailable"); },
    async authorizeHookAttempt() { throw new Error("fixture unavailable"); },
  };
  const result = await handleVerifiedSmsHook({
    ...signedHook(), webhookSecret: `v1,whsec_${WEBHOOK_KEY}`, hmacSecret: HMAC_SECRET,
    nowSeconds: NOW, gateway: broken,
    provider: { async send() { calls += 1; return { outcome: "accepted" }; } },
  });
  assert.deepEqual(result, { status: "denied", decision: "blocked", failureClass: "transient" });
  assert.equal(calls, 0);
});

test("calculates the fixed OTP template as one GSM-7 segment", () => {
  assert.deepEqual(countGsm7Segments("Your Corralio verification code is 123456."), {
    encoding: "gsm7",
    units: 42,
    segments: 1,
  });
  assert.equal(countGsm7Segments("Verification 🔒").encoding, "ucs2");
});
