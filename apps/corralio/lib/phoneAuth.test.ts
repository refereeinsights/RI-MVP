import assert from "node:assert/strict";
import test from "node:test";

import { deriveChannelAddressHmac, parseManualOtp, readPhoneAuthConfiguration } from "./phoneAuth";

test("phone auth stays disabled unless both server flag and site key exist", () => {
  assert.equal(readPhoneAuthConfiguration({ NODE_ENV: "test", CORRALIO_PHONE_AUTH_ENABLED: "true" }).enabled, false);
  assert.equal(readPhoneAuthConfiguration({
    NODE_ENV: "test",
    CORRALIO_PHONE_AUTH_ENABLED: "true",
    NEXT_PUBLIC_CORRALIO_TURNSTILE_SITE_KEY: "site-key",
  }).enabled, true);
});

test("channel HMAC is deterministic, domain-separated, and validates its secret", () => {
  const secret = "s".repeat(32);
  const phone = deriveChannelAddressHmac(secret, "phone", "+15095550123");
  assert.match(phone, /^[0-9a-f]{64}$/);
  assert.equal(phone, deriveChannelAddressHmac(secret, "phone", "+15095550123"));
  assert.notEqual(phone, deriveChannelAddressHmac(secret, "email", "+15095550123"));
  assert.throws(() => deriveChannelAddressHmac("short", "phone", "+15095550123"));
});

test("manual OTP accepts exactly six digits", () => {
  assert.equal(parseManualOtp("123456"), "123456");
  assert.equal(parseManualOtp("12345"), null);
  assert.equal(parseManualOtp("12345a"), null);
});
