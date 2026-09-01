import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import {
  PersistentSegmentLedger,
  SpikeSafetyError,
  assertOutboundEligible,
  calculateGsm7Segments,
  validateSpikeConfig,
  verifyTelnyxFixture,
} from "./corralio_sms_telnyx_spike_safety.mjs";

const syntheticEnvironment = {
  TELNYX_API_KEY: "synthetic-test-key",
  TELNYX_MESSAGING_PROFILE_ID: "11111111-1111-4111-8111-111111111111",
  TELNYX_PUBLIC_KEY: "11".repeat(32),
  TELNYX_PHONE_NUMBER: "+15555550100",
  CORRALIO_SMS_CHANNEL_HMAC_SECRET: Buffer.alloc(32, 9).toString("base64"),
  CORRALIO_SMS_TEST_ALLOWLIST: "+15555550101",
  CORRALIO_SMS_SEND_MODE: "test_allowlist",
  CORRALIO_SMS_TEST_DAILY_SEGMENT_LIMIT: "20",
  CORRALIO_SMS_TEST_DESTINATION_DAILY_SEGMENT_LIMIT: "5",
  CORRALIO_SMS_MAX_SEGMENTS_PER_MESSAGE: "1",
};

async function temporaryLedger() {
  const directory = await mkdtemp(join(tmpdir(), "corralio-sms-ledger-"));
  return { directory, path: join(directory, "ledger.json") };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof SpikeSafetyError && error.code === code);
}

function spawnWorker(path) {
  const modulePath = new URL("./corralio_sms_telnyx_spike_safety.mjs", import.meta.url);
  return new Promise((resolveWorker) => {
    const child = spawn(
      process.execPath,
      [modulePath.pathname, "reserve-test", path, "+15555550111", "20", "20"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    child.on("close", (code) => resolveWorker({ code, output: output.trim() }));
  });
}

test("configuration is closed, allowlisted, and one-segment only", () => {
  const config = validateSpikeConfig(syntheticEnvironment);
  assert.deepEqual(assertOutboundEligible({
    config,
    destination: "+15555550101",
    message: "Corralio test message. No action needed.",
  }), { segments: 1 });
  assert.equal(calculateGsm7Segments("a".repeat(161)), 2);
  assert.throws(
    () => assertOutboundEligible({ config, destination: "+15555550102", message: "test" }),
    (error) => error.code === "SMS_DESTINATION_NOT_ALLOWLISTED",
  );
  assert.throws(
    () => assertOutboundEligible({ config, destination: "+15555550101", message: "a".repeat(161) }),
    (error) => error.code === "SMS_MESSAGE_SEGMENT_LIMIT",
  );
  assert.throws(
    () => validateSpikeConfig({ ...syntheticEnvironment, CORRALIO_SMS_SEND_MODE: "disabled" }),
    (error) => error.code === "INVALID_CORRALIO_SMS_SEND_MODE",
  );
});

test("ledger persists across instances and enforces destination/global caps", async () => {
  const fixture = await temporaryLedger();
  try {
    const options = {
      path: fixture.path,
      hmacSecret: Buffer.alloc(32, 4),
      dailyLimit: 6,
      destinationDailyLimit: 5,
    };
    const first = new PersistentSegmentLedger(options);
    for (let index = 0; index < 5; index += 1) {
      await first.reserve({ destination: "+15555550103", segments: 1, now: new Date("2026-08-31T12:00:00Z") });
    }
    const restarted = new PersistentSegmentLedger(options);
    await expectCode(
      restarted.reserve({ destination: "+15555550103", segments: 1, now: new Date("2026-08-31T12:01:00Z") }),
      "SMS_DESTINATION_DAILY_LIMIT",
    );
    await restarted.reserve({ destination: "+15555550104", segments: 1, now: new Date("2026-08-31T12:01:00Z") });
    await expectCode(
      restarted.reserve({ destination: "+15555550105", segments: 1, now: new Date("2026-08-31T12:01:00Z") }),
      "SMS_GLOBAL_DAILY_LIMIT",
    );
    assert.deepEqual(
      await restarted.summary({ destination: "+15555550103", now: new Date("2026-08-31T12:02:00Z") }),
      { totalReserved: 6, destinationReserved: 5, reservationCount: 6 },
    );
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("locked or corrupt ledger fails closed", async () => {
  const fixture = await temporaryLedger();
  try {
    const ledger = new PersistentSegmentLedger({
      path: fixture.path,
      hmacSecret: Buffer.alloc(32, 5),
      dailyLimit: 20,
      destinationDailyLimit: 5,
      lockTimeoutMilliseconds: 20,
    });
    await mkdir(`${fixture.path}.lock`);
    await expectCode(
      ledger.reserve({ destination: "+15555550106", segments: 1, now: new Date("2026-08-31T12:00:00Z") }),
      "SMS_LEDGER_UNAVAILABLE",
    );
    await rm(`${fixture.path}.lock`, { recursive: true, force: true });
    await writeFile(fixture.path, "not json", { mode: 0o600 });
    await expectCode(
      ledger.reserve({ destination: "+15555550106", segments: 1, now: new Date("2026-08-31T12:00:00Z") }),
      "SMS_LEDGER_INVALID",
    );
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("ambiguous outcome remains reserved", async () => {
  const fixture = await temporaryLedger();
  try {
    const options = {
      path: fixture.path,
      hmacSecret: Buffer.alloc(32, 6),
      dailyLimit: 20,
      destinationDailyLimit: 5,
    };
    await new PersistentSegmentLedger(options).reserve({
      destination: "+15555550107",
      segments: 1,
      now: new Date("2026-08-31T12:00:00Z"),
    });
    const restarted = new PersistentSegmentLedger(options);
    assert.deepEqual(
      await restarted.summary({ destination: "+15555550107", now: new Date("2026-08-31T12:10:00Z") }),
      { totalReserved: 1, destinationReserved: 1, reservationCount: 1 },
    );
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("separate processes cannot exceed a 19-of-20 global budget", async () => {
  const fixture = await temporaryLedger();
  try {
    const ledger = new PersistentSegmentLedger({
      path: fixture.path,
      hmacSecret: Buffer.alloc(32, 7),
      dailyLimit: 20,
      destinationDailyLimit: 20,
    });
    for (let index = 0; index < 19; index += 1) {
      await ledger.reserve({ destination: "+15555550111", segments: 1, now: new Date("2026-08-31T12:00:00Z") });
    }
    const outcomes = await Promise.all([spawnWorker(fixture.path), spawnWorker(fixture.path)]);
    assert.deepEqual(outcomes.map((result) => result.output).sort(), ["DENIED", "RESERVED"]);
    const persisted = JSON.parse(await readFile(fixture.path, "utf8"));
    assert.equal(persisted.totalReserved, 20);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("signature fixture enforces headers, freshness, signature, payload, type, and replay", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const timestamp = "1788177600";
  const validBody = JSON.stringify({ data: { id: "event-fixture-1", event_type: "message.received" } });
  const makeSignature = (body, time = timestamp) => sign(
    null,
    Buffer.from(`${time}|${body}`, "utf8"),
    privateKey,
  ).toString("base64");
  const seen = new Set();
  assert.deepEqual(verifyTelnyxFixture({
    rawBody: validBody,
    signature: makeSignature(validBody),
    timestamp,
    publicKey,
    nowSeconds: Number(timestamp),
    seenEventIds: seen,
  }), { eventType: "message.received" });
  assert.throws(() => verifyTelnyxFixture({
    rawBody: validBody,
    signature: makeSignature(validBody),
    timestamp,
    publicKey,
    nowSeconds: Number(timestamp),
    seenEventIds: seen,
  }), (error) => error.code === "TELNYX_EVENT_REPLAY");
  assert.throws(() => verifyTelnyxFixture({
    rawBody: validBody,
    signature: makeSignature(validBody),
    timestamp,
    publicKey,
    nowSeconds: Number(timestamp) + 301,
    seenEventIds: new Set(),
  }), (error) => error.code === "TELNYX_TIMESTAMP_STALE");
  assert.throws(() => verifyTelnyxFixture({
    rawBody: validBody,
    signature: makeSignature(`${validBody}x`),
    timestamp,
    publicKey,
    nowSeconds: Number(timestamp),
    seenEventIds: new Set(),
  }), (error) => error.code === "TELNYX_SIGNATURE_INVALID");
  const malformed = "{";
  assert.throws(() => verifyTelnyxFixture({
    rawBody: malformed,
    signature: makeSignature(malformed),
    timestamp,
    publicKey,
    nowSeconds: Number(timestamp),
    seenEventIds: new Set(),
  }), (error) => error.code === "TELNYX_PAYLOAD_INVALID");
  const unsupported = JSON.stringify({ data: { id: "event-fixture-2", event_type: "other" } });
  assert.throws(() => verifyTelnyxFixture({
    rawBody: unsupported,
    signature: makeSignature(unsupported),
    timestamp,
    publicKey,
    nowSeconds: Number(timestamp),
    seenEventIds: new Set(),
  }), (error) => error.code === "TELNYX_EVENT_TYPE_UNSUPPORTED");
  assert.throws(() => verifyTelnyxFixture({
    rawBody: validBody,
    signature: "",
    timestamp,
    publicKey,
    nowSeconds: Number(timestamp),
    seenEventIds: new Set(),
  }), (error) => error.code === "TELNYX_SIGNATURE_HEADERS_MISSING");
});
