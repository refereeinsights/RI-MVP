import assert from "node:assert/strict";
import test from "node:test";

import {
  TURNSTILE_TOKEN_MAX_AGE_MS,
  claimFreshTurnstileToken,
  classifyGate3CaptchaFailure,
} from "./turnstileDiagnostics";

test("a fresh Turnstile token can be claimed exactly once", () => {
  const state = { token: "fixture-token", issuedAtMs: 1_000, claimed: false };
  const first = claimFreshTurnstileToken(state, 1_001);
  assert.equal(first.category, "ready");
  assert.equal(first.token, "fixture-token");
  assert.equal(first.nextState.claimed, true);
  assert.deepEqual(claimFreshTurnstileToken(first.nextState, 1_002), {
    category: "expired_or_reused_token",
    token: null,
    nextState: null,
  });
});

test("missing, expired, and invalid-clock tokens fail before Auth", () => {
  assert.equal(claimFreshTurnstileToken(null, 1_000).category, "missing_token");
  assert.equal(claimFreshTurnstileToken(
    { token: "fixture", issuedAtMs: 1_000, claimed: false },
    1_000 + TURNSTILE_TOKEN_MAX_AGE_MS,
  ).category, "expired_or_reused_token");
  assert.equal(claimFreshTurnstileToken(
    { token: "fixture", issuedAtMs: 2_000, claimed: false },
    1_000,
  ).category, "expired_or_reused_token");
});

test("CAPTCHA diagnostics use bounded evidence and never parse secret/provider text", () => {
  const base = {
    tokenState: "present" as const,
    deployedSitekeyMatchesWidget: true,
    supabaseSecretMatchesWidget: true,
    hostnameMatchesWidget: true,
    supabaseErrorCode: "captcha_failed",
  };
  assert.equal(classifyGate3CaptchaFailure({ ...base, tokenState: "missing" }), "missing_token");
  assert.equal(
    classifyGate3CaptchaFailure({ ...base, tokenState: "expired_or_reused" }),
    "expired_or_reused_token",
  );
  assert.equal(
    classifyGate3CaptchaFailure({ ...base, supabaseSecretMatchesWidget: false }),
    "wrong_secret_sitekey_pairing",
  );
  assert.equal(
    classifyGate3CaptchaFailure({ ...base, deployedSitekeyMatchesWidget: false }),
    "wrong_secret_sitekey_pairing",
  );
  assert.equal(
    classifyGate3CaptchaFailure({ ...base, hostnameMatchesWidget: false }),
    "hostname_or_configuration_mismatch",
  );
  assert.equal(classifyGate3CaptchaFailure(base), "generic_captcha_failed");
  assert.equal(classifyGate3CaptchaFailure({ ...base, supabaseErrorCode: null }), null);
});
