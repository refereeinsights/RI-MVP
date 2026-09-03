import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createSecretKey,
  randomBytes,
  timingSafeEqual,
  type KeyObject,
} from "node:crypto";

const ACTIVE_KEY_VERSION_ENV = "CORRALIO_PENDING_SECRET_ACTIVE_KEY_VERSION";
const ENCRYPTION_KEY_PREFIX = "CORRALIO_PENDING_SECRET_ENCRYPTION_KEY_";
const FINGERPRINT_KEY_ENV = "CORRALIO_PENDING_SECRET_FINGERPRINT_KEY";
const ALGORITHM = "A256GCM" as const;
const ENVELOPE_VERSION = 1 as const;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const MAX_PLAINTEXT_BYTES = 32_768;
const ENCRYPTION_AAD = toExactBytes(Buffer.from("corralio:pending-calendar-url:v1", "utf8"));
const FINGERPRINT_DOMAIN = "corralio:pending-calendar-url-fingerprint:v1\0";

export type PendingSecretFailureCode =
  | "configuration_unavailable"
  | "invalid_plaintext"
  | "encrypt_failed"
  | "invalid_envelope"
  | "unsupported_algorithm"
  | "unknown_key_version"
  | "integrity_check_failed"
  | "decrypt_failed";

export class PendingSecretBoundaryError extends Error {
  readonly code: PendingSecretFailureCode;

  constructor(code: PendingSecretFailureCode) {
    super(`Pending secret operation failed: ${code}`);
    this.name = "PendingSecretBoundaryError";
    this.code = code;
  }
}

type Keyring = {
  activeVersion: string;
  encryptionKeys: ReadonlyMap<string, KeyObject>;
  fingerprintKey: KeyObject;
};

type PendingSecretEnvelopeV1 = {
  v: typeof ENVELOPE_VERSION;
  alg: typeof ALGORITHM;
  kid: string;
  iv: string;
  ct: string;
  tag: string;
};

export type PendingSecretBoundary = {
  encrypt(plaintext: string): string;
  decrypt(serializedEnvelope: string): string;
  fingerprint(plaintext: string): string;
};

function fail(code: PendingSecretFailureCode): never {
  throw new PendingSecretBoundaryError(code);
}

function toExactBytes(value: ArrayLike<number>): Uint8Array {
  const exact = new Uint8Array(new ArrayBuffer(value.length));
  exact.set(value);
  return exact;
}

function concatenateBytes(...values: ArrayLike<number>[]): Uint8Array {
  const combined = new Uint8Array(new ArrayBuffer(values.reduce((sum, value) => sum + value.length, 0)));
  let offset = 0;
  for (const value of values) {
    combined.set(value, offset);
    offset += value.length;
  }
  return combined;
}

function asDataView(value: Uint8Array): DataView {
  return new DataView(value.buffer as ArrayBuffer, value.byteOffset, value.byteLength);
}

function encodeBase64Url(value: Uint8Array): string {
  return Buffer.from(value.buffer as ArrayBuffer, value.byteOffset, value.byteLength).toString("base64url");
}

function decodeConfiguredKey(value: string | undefined): Uint8Array {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    fail("configuration_unavailable");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== KEY_BYTES || decoded.toString("base64") !== value) {
    fail("configuration_unavailable");
  }
  return toExactBytes(decoded);
}

function loadKeyring(environment: NodeJS.ProcessEnv): Keyring {
  const activeVersion = environment[ACTIVE_KEY_VERSION_ENV];
  if (!activeVersion || !/^v[1-9][0-9]*$/.test(activeVersion)) {
    fail("configuration_unavailable");
  }

  const rawEncryptionKeys = new Map<string, Uint8Array>();
  for (const [name, value] of Object.entries(environment)) {
    const match = new RegExp(`^${ENCRYPTION_KEY_PREFIX}(V[1-9][0-9]*)$`).exec(name);
    if (!match || value === undefined) continue;
    rawEncryptionKeys.set(match[1].toLowerCase(), decodeConfiguredKey(value));
  }

  const activeKey = rawEncryptionKeys.get(activeVersion);
  if (!activeKey) fail("configuration_unavailable");

  const rawFingerprintKey = decodeConfiguredKey(environment[FINGERPRINT_KEY_ENV]);
  for (const encryptionKey of rawEncryptionKeys.values()) {
    if (timingSafeEqual(asDataView(encryptionKey), asDataView(rawFingerprintKey))) {
      fail("configuration_unavailable");
    }
  }

  const encryptionKeys = new Map<string, KeyObject>();
  for (const [version, key] of rawEncryptionKeys) {
    encryptionKeys.set(version, createSecretKey(asDataView(key)));
  }
  const fingerprintKey = createSecretKey(asDataView(rawFingerprintKey));
  return { activeVersion, encryptionKeys, fingerprintKey };
}

function validatePlaintext(plaintext: string): void {
  if (typeof plaintext !== "string") fail("invalid_plaintext");
  const byteLength = Buffer.byteLength(plaintext, "utf8");
  if (byteLength === 0 || byteLength > MAX_PLAINTEXT_BYTES) {
    fail("invalid_plaintext");
  }
}

function decodeBase64Url(value: unknown, expectedBytes?: number): Uint8Array {
  if (typeof value !== "string" || value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    fail("invalid_envelope");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value || (expectedBytes !== undefined && decoded.length !== expectedBytes)) {
    fail("invalid_envelope");
  }
  return toExactBytes(decoded);
}

function parseEnvelope(serializedEnvelope: string): {
  envelope: PendingSecretEnvelopeV1;
  iv: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
} {
  if (typeof serializedEnvelope !== "string" || serializedEnvelope.length === 0) {
    fail("invalid_envelope");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedEnvelope);
  } catch {
    fail("invalid_envelope");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("invalid_envelope");

  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort().join(",");
  if (keys !== "alg,ct,iv,kid,tag,v") fail("invalid_envelope");
  if (record.v !== ENVELOPE_VERSION) fail("invalid_envelope");
  if (record.alg !== ALGORITHM) fail("unsupported_algorithm");
  if (typeof record.kid !== "string" || !/^v[1-9][0-9]*$/.test(record.kid)) {
    fail("invalid_envelope");
  }

  const envelope = record as PendingSecretEnvelopeV1;
  return {
    envelope,
    iv: decodeBase64Url(envelope.iv, IV_BYTES),
    ciphertext: decodeBase64Url(envelope.ct),
    tag: decodeBase64Url(envelope.tag, TAG_BYTES),
  };
}

export function createPendingSecretBoundary(
  environment: NodeJS.ProcessEnv = process.env,
): PendingSecretBoundary {
  const keyring = loadKeyring(environment);

  return {
    encrypt(plaintext) {
      validatePlaintext(plaintext);
      const activeKey = keyring.encryptionKeys.get(keyring.activeVersion);
      if (!activeKey) fail("configuration_unavailable");

      try {
        const iv = toExactBytes(randomBytes(IV_BYTES));
        const cipher = createCipheriv("aes-256-gcm", activeKey, asDataView(iv), { authTagLength: TAG_BYTES });
        cipher.setAAD(asDataView(ENCRYPTION_AAD));
        const ciphertext = concatenateBytes(cipher.update(plaintext, "utf8"), cipher.final());
        const envelope: PendingSecretEnvelopeV1 = {
          v: ENVELOPE_VERSION,
          alg: ALGORITHM,
          kid: keyring.activeVersion,
          iv: encodeBase64Url(iv),
          ct: encodeBase64Url(ciphertext),
          tag: encodeBase64Url(toExactBytes(cipher.getAuthTag())),
        };
        return JSON.stringify(envelope);
      } catch (error) {
        if (error instanceof PendingSecretBoundaryError) throw error;
        fail("encrypt_failed");
      }
    },

    decrypt(serializedEnvelope) {
      const { envelope, iv, ciphertext, tag } = parseEnvelope(serializedEnvelope);
      const key = keyring.encryptionKeys.get(envelope.kid);
      if (!key) fail("unknown_key_version");

      let plaintext: Uint8Array;
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, asDataView(iv), { authTagLength: TAG_BYTES });
        decipher.setAAD(asDataView(ENCRYPTION_AAD));
        decipher.setAuthTag(asDataView(tag));
        plaintext = concatenateBytes(decipher.update(asDataView(ciphertext)), decipher.final());
      } catch {
        fail("integrity_check_failed");
      }

      try {
        const decoded = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
        validatePlaintext(decoded);
        return decoded;
      } catch (error) {
        if (error instanceof PendingSecretBoundaryError) throw error;
        fail("decrypt_failed");
      }
    },

    fingerprint(plaintext) {
      validatePlaintext(plaintext);
      return `v1:${createHmac("sha256", keyring.fingerprintKey)
        .update(FINGERPRINT_DOMAIN, "utf8")
        .update(plaintext, "utf8")
        .digest("hex")}`;
    },
  };
}
