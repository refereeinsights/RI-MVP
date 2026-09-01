import assert from "node:assert/strict";
import test from "node:test";

import type { SmsDurableSafetyGateway } from "./durableSafety";
import { assertIsolatedSmsRuntimeConfiguration, requestIsolatedSmsOtp } from "./isolatedRuntime";

const baseEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  CORRALIO_GATE3_ISOLATED_RUNTIME: "1",
  CORRALIO_GATE3_MOCK_PROVIDER: "1",
  CORRALIO_GATE3_ISOLATED_SUPABASE_REF: "isolatedref",
  CORRALIO_GATE3_FORBIDDEN_SUPABASE_REFS: "productionref,stagingref",
  NEXT_PUBLIC_SUPABASE_URL: "https://isolatedref.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-anon",
  SUPABASE_SERVICE_ROLE_KEY: "fixture-service",
  CORRALIO_SMS_CHANNEL_HMAC_SECRET: "fixture-hmac-secret-at-least-thirty-two-bytes",
  CORRALIO_SMS_SEND_HOOK_SECRET: "v1,whsec_Zml4dHVyZS1ob29rLXNlY3JldA==",
  CORRALIO_SITE_URL: "https://gate3.example.test",
};

function gateway(decision: "authorized" | "rate_limited" = "authorized"): SmsDurableSafetyGateway {
  return {
    async authorizeOtpRequest() { return decision; },
    async authorizeHookAttempt() { return "blocked"; },
  };
}

test("isolated configuration rejects provider credentials and project mismatches", () => {
  assert.equal(assertIsolatedSmsRuntimeConfiguration(baseEnvironment).actualRef, "isolatedref");
  assert.throws(() => assertIsolatedSmsRuntimeConfiguration({ ...baseEnvironment, TELNYX_API_KEY: "forbidden" }));
  assert.throws(() => assertIsolatedSmsRuntimeConfiguration({
    ...baseEnvironment,
    NEXT_PUBLIC_SUPABASE_URL: "https://productionref.supabase.co",
  }));
});

test("durable denial and missing captcha never invoke Supabase phone Auth", async () => {
  let calls = 0;
  const request = new Request("https://gate3.example.test/api/gate3/otp/request", {
    method: "POST",
    headers: {
      origin: "https://gate3.example.test",
      "sec-fetch-site": "same-origin",
      "x-vercel-forwarded-for": "203.0.113.12",
    },
  });
  const signInWithOtp = async () => { calls += 1; return { error: null }; };
  assert.deepEqual(await requestIsolatedSmsOtp({
    request, phone: "+12025550123", captchaToken: "", expectedOrigin: "https://gate3.example.test",
    hmacSecret: baseEnvironment.CORRALIO_SMS_CHANNEL_HMAC_SECRET!, gateway: gateway(), signInWithOtp,
    isVercelRuntime: true,
  }), { status: "denied" });
  assert.deepEqual(await requestIsolatedSmsOtp({
    request, phone: "+12025550123", captchaToken: "fixture-token", expectedOrigin: "https://gate3.example.test",
    hmacSecret: baseEnvironment.CORRALIO_SMS_CHANNEL_HMAC_SECRET!, gateway: gateway("rate_limited"), signInWithOtp,
    isVercelRuntime: true,
  }), { status: "denied" });
  assert.equal(calls, 0);
});

test("only an authorized request invokes Supabase with bounded inputs", async () => {
  let calls = 0;
  const request = new Request("https://gate3.example.test/api/gate3/otp/request", {
    method: "POST",
    headers: {
      origin: "https://gate3.example.test",
      "sec-fetch-site": "same-origin",
      "x-vercel-forwarded-for": "203.0.113.13",
    },
  });
  const result = await requestIsolatedSmsOtp({
    request, phone: "+12025550124", captchaToken: "fixture-token", expectedOrigin: "https://gate3.example.test",
    hmacSecret: baseEnvironment.CORRALIO_SMS_CHANNEL_HMAC_SECRET!, gateway: gateway(),
    signInWithOtp: async (input) => {
      calls += 1;
      assert.deepEqual(input, { phone: "+12025550124", captchaToken: "fixture-token" });
      return { error: null };
    },
    isVercelRuntime: true,
  });
  assert.deepEqual(result, { status: "pending" });
  assert.equal(calls, 1);
});
