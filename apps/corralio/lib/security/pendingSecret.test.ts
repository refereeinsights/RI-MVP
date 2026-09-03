import assert from "node:assert/strict";
import test from "node:test";

import {
  createPendingSecretBoundary,
  PendingSecretBoundaryError,
  type PendingSecretFailureCode,
} from "./pendingSecret.server";

const KEY_V1 = Buffer.alloc(32, 0x11).toString("base64");
const KEY_V2 = Buffer.alloc(32, 0x22).toString("base64");
const WRONG_KEY = Buffer.alloc(32, 0x33).toString("base64");
const FINGERPRINT_KEY = Buffer.alloc(32, 0x44).toString("base64");
const URL_A = "https://calendar.invalid/subscription?fixture=synthetic-alpha";
const URL_B = "https://calendar.invalid/subscription?fixture=synthetic-beta";

function environment(input: {
  active?: string;
  v1?: string;
  v2?: string;
  fingerprint?: string;
} = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    CORRALIO_PENDING_SECRET_ACTIVE_KEY_VERSION: input.active ?? "v1",
    CORRALIO_PENDING_SECRET_ENCRYPTION_KEY_V1: input.v1 ?? KEY_V1,
    ...(input.v2 === undefined ? {} : { CORRALIO_PENDING_SECRET_ENCRYPTION_KEY_V2: input.v2 }),
    CORRALIO_PENDING_SECRET_FINGERPRINT_KEY: input.fingerprint ?? FINGERPRINT_KEY,
  };
}

function expectCode(action: () => unknown, code: PendingSecretFailureCode): PendingSecretBoundaryError {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof PendingSecretBoundaryError);
  assert.equal(caught.code, code);
  return caught;
}

function mutateEnvelope(
  serialized: string,
  mutate: (envelope: Record<string, unknown>) => void,
): string {
  const envelope = JSON.parse(serialized) as Record<string, unknown>;
  mutate(envelope);
  return JSON.stringify(envelope);
}

function flipBase64UrlByte(value: unknown): string {
  assert.equal(typeof value, "string");
  const bytes = Buffer.from(value as string, "base64url");
  bytes[0] ^= 0x01;
  return bytes.toString("base64url");
}

test("round-trips exact plaintext with randomized authenticated encryption", () => {
  const boundary = createPendingSecretBoundary(environment());
  const first = boundary.encrypt(URL_A);
  const second = boundary.encrypt(URL_A);
  assert.equal(boundary.decrypt(first), URL_A);
  assert.equal(boundary.decrypt(second), URL_A);
  assert.notEqual(first, second);
  assert.notEqual((JSON.parse(first) as { iv: string }).iv, (JSON.parse(second) as { iv: string }).iv);
});

test("creates deterministic domain-separated fingerprints without plaintext", () => {
  const boundary = createPendingSecretBoundary(environment());
  const first = boundary.fingerprint(URL_A);
  assert.equal(first, boundary.fingerprint(URL_A));
  assert.notEqual(first, boundary.fingerprint(URL_B));
  assert.match(first, /^v1:[0-9a-f]{64}$/);
  assert.equal(first.includes(URL_A), false);
});

test("rejects encryption/fingerprint key reuse and malformed key material", () => {
  expectCode(
    () => createPendingSecretBoundary(environment({ fingerprint: KEY_V1 })),
    "configuration_unavailable",
  );
  expectCode(
    () => createPendingSecretBoundary(environment({ v1: "not-base64" })),
    "configuration_unavailable",
  );
});

test("fails closed when ciphertext, tag, or nonce is tampered", () => {
  const boundary = createPendingSecretBoundary(environment());
  const encrypted = boundary.encrypt(URL_A);
  for (const field of ["ct", "tag", "iv"] as const) {
    const tampered = mutateEnvelope(encrypted, (envelope) => {
      envelope[field] = flipBase64UrlByte(envelope[field]);
    });
    expectCode(() => boundary.decrypt(tampered), "integrity_check_failed");
  }
});

test("wrong keys and unknown key versions fail closed", () => {
  const encrypted = createPendingSecretBoundary(environment()).encrypt(URL_A);
  expectCode(
    () => createPendingSecretBoundary(environment({ v1: WRONG_KEY })).decrypt(encrypted),
    "integrity_check_failed",
  );
  const unknown = mutateEnvelope(encrypted, (envelope) => { envelope.kid = "v9"; });
  expectCode(() => createPendingSecretBoundary(environment()).decrypt(unknown), "unknown_key_version");
});

test("requires a configured active version and active key", () => {
  expectCode(
    () => createPendingSecretBoundary(environment({ active: "" })),
    "configuration_unavailable",
  );
  expectCode(
    () => createPendingSecretBoundary({
      NODE_ENV: "test",
      CORRALIO_PENDING_SECRET_ACTIVE_KEY_VERSION: "v2",
      CORRALIO_PENDING_SECRET_ENCRYPTION_KEY_V1: KEY_V1,
      CORRALIO_PENDING_SECRET_FINGERPRINT_KEY: FINGERPRINT_KEY,
    }),
    "configuration_unavailable",
  );
});

test("decrypts old-version ciphertext while encrypting new values with the active version", () => {
  const oldEnvelope = createPendingSecretBoundary(environment()).encrypt(URL_A);
  const rotated = createPendingSecretBoundary(environment({ active: "v2", v2: KEY_V2 }));
  assert.equal(rotated.decrypt(oldEnvelope), URL_A);
  assert.equal((JSON.parse(rotated.encrypt(URL_B)) as { kid: string }).kid, "v2");
});

test("rejects malformed or unsupported envelopes and empty plaintext", () => {
  const boundary = createPendingSecretBoundary(environment());
  expectCode(() => boundary.encrypt(""), "invalid_plaintext");
  expectCode(() => boundary.fingerprint(""), "invalid_plaintext");
  expectCode(() => boundary.decrypt(""), "invalid_envelope");
  expectCode(() => boundary.decrypt("not-json"), "invalid_envelope");

  const encrypted = boundary.encrypt(URL_A);
  expectCode(
    () => boundary.decrypt(mutateEnvelope(encrypted, (envelope) => { envelope.extra = true; })),
    "invalid_envelope",
  );
  expectCode(
    () => boundary.decrypt(mutateEnvelope(encrypted, (envelope) => { envelope.alg = "fixture"; })),
    "unsupported_algorithm",
  );
});

test("errors and serialized envelopes do not expose plaintext or keys", () => {
  const boundary = createPendingSecretBoundary(environment());
  const encrypted = boundary.encrypt(URL_A);
  assert.equal(encrypted.includes(URL_A), false);
  assert.equal(encrypted.includes(KEY_V1), false);
  assert.equal(encrypted.includes(FINGERPRINT_KEY), false);

  const error = expectCode(
    () => boundary.decrypt(mutateEnvelope(encrypted, (envelope) => {
      envelope.tag = flipBase64UrlByte(envelope.tag);
    })),
    "integrity_check_failed",
  );
  assert.equal(error.message.includes(URL_A), false);
  assert.equal(error.message.includes(KEY_V1), false);
  assert.equal(error.message.includes(FINGERPRINT_KEY), false);
});
