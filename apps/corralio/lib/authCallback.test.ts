import assert from "node:assert/strict";
import test from "node:test";

import { resolveCorralioAuthCallback } from "./authCallback";

test("preserves email and magic-link callbacks as non-recovery flows", () => {
  for (const type of ["email", "magiclink"] as const) {
    assert.deepEqual(resolveCorralioAuthCallback({ code: null, tokenHash: "token", type, flow: null }), {
      valid: true,
      recovery: false,
      otpType: type,
    });
  }
});

test("recognizes token-hash and PKCE recovery callbacks", () => {
  assert.deepEqual(resolveCorralioAuthCallback({ code: null, tokenHash: "token", type: "recovery", flow: null }), {
    valid: true,
    recovery: true,
    otpType: "recovery",
  });
  assert.deepEqual(resolveCorralioAuthCallback({ code: "code", tokenHash: null, type: null, flow: "recovery" }), {
    valid: true,
    recovery: true,
    otpType: null,
  });
});

test("rejects incomplete and unsupported callback inputs", () => {
  assert.equal(resolveCorralioAuthCallback({ code: null, tokenHash: null, type: null, flow: null }).valid, false);
  assert.equal(resolveCorralioAuthCallback({ code: null, tokenHash: "token", type: "signup", flow: null }).valid, false);
});
