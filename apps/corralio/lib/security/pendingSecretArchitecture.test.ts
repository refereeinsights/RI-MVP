import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());
const source = readFileSync(
  path.join(root, "apps/corralio/lib/security/pendingSecret.server.ts"),
  "utf8",
);

test("keeps pending-secret crypto behind a server-only module boundary", () => {
  assert.match(source, /^import "server-only";/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_/);
  assert.doesNotMatch(source, /export (?:const|function) (?:loadKeyring|decodeConfiguredKey)/);
});

test("uses standard AEAD, randomized nonces, explicit key IDs, and associated data", () => {
  assert.match(source, /createCipheriv\("aes-256-gcm"/);
  assert.match(source, /randomBytes\(IV_BYTES\)/);
  assert.match(source, /authTagLength: TAG_BYTES/);
  assert.match(source, /cipher\.setAAD\(asDataView\(ENCRYPTION_AAD\)\)/);
  assert.match(source, /kid: keyring\.activeVersion/);
  assert.match(source, /alg: ALGORITHM/);
});

test("uses a distinct keyed HMAC fingerprint with explicit domain separation", () => {
  assert.match(source, /CORRALIO_PENDING_SECRET_FINGERPRINT_KEY/);
  assert.match(source, /createHmac\("sha256", keyring\.fingerprintKey\)/);
  assert.match(source, /pending-calendar-url-fingerprint:v1/);
  assert.match(source, /timingSafeEqual\(asDataView\(encryptionKey\), asDataView\(rawFingerprintKey\)\)/);
  assert.doesNotMatch(source, /CORRALIO_SMS_CHANNEL_HMAC_SECRET/);
});

test("contains no network, provider, analytics, or logging path", () => {
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /telnyx|supabase|turnstile|analytics/i);
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
});
