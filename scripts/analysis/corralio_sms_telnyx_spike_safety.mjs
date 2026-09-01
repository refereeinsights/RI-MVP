import {
  createHmac,
  createPublicKey,
  randomUUID,
  verify as verifySignature,
} from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rmdir,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const E164 = /^\+[1-9]\d{7,14}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASIC_GSM7 = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà".split(""),
);
const EXTENDED_GSM7 = new Set("^{}\\[~]|€".split(""));

export class SpikeSafetyError extends Error {
  constructor(code) {
    super(code);
    this.name = "SpikeSafetyError";
    this.code = code;
  }
}

function fail(code) {
  throw new SpikeSafetyError(code);
}

export async function readEnvFile(path) {
  const source = await readFile(path, "utf8");
  const values = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }

  return values;
}

function requireValue(values, name) {
  const value = values[name]?.trim();
  if (!value) fail(`MISSING_${name}`);
  return value;
}

function parseExactInteger(values, name, expected) {
  const raw = requireValue(values, name);
  if (!/^\d+$/.test(raw) || Number(raw) !== expected) fail(`INVALID_${name}`);
  return expected;
}

function decodeHmacSecret(raw) {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) fail("INVALID_CORRALIO_SMS_CHANNEL_HMAC_SECRET");
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.length < 32) fail("INVALID_CORRALIO_SMS_CHANNEL_HMAC_SECRET");
  return decoded;
}

export function parseTelnyxPublicKey(raw) {
  const value = raw.trim();
  if (value.startsWith("-----BEGIN PUBLIC KEY-----")) return createPublicKey(value);

  let publicBytes;
  if (/^[0-9a-f]{64}$/i.test(value)) {
    publicBytes = Buffer.from(value, "hex");
  } else if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    publicBytes = Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } else {
    fail("INVALID_TELNYX_PUBLIC_KEY");
  }

  if (publicBytes.length !== 32) fail("INVALID_TELNYX_PUBLIC_KEY");
  const ed25519SpkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  return createPublicKey({
    key: Buffer.concat([ed25519SpkiPrefix, publicBytes]),
    format: "der",
    type: "spki",
  });
}

export function validateSpikeConfig(values) {
  const apiKey = requireValue(values, "TELNYX_API_KEY");
  const profileId = requireValue(values, "TELNYX_MESSAGING_PROFILE_ID");
  if (!UUID.test(profileId)) fail("INVALID_TELNYX_MESSAGING_PROFILE_ID");

  const publicKeyRaw = requireValue(values, "TELNYX_PUBLIC_KEY");
  const publicKey = parseTelnyxPublicKey(publicKeyRaw);
  const fromNumber = requireValue(values, "TELNYX_PHONE_NUMBER");
  if (!E164.test(fromNumber)) fail("INVALID_TELNYX_PHONE_NUMBER");

  const allowlist = requireValue(values, "CORRALIO_SMS_TEST_ALLOWLIST")
    .split(",")
    .map((value) => value.trim());
  if (allowlist.length !== 1 || !E164.test(allowlist[0])) fail("INVALID_CORRALIO_SMS_TEST_ALLOWLIST");

  if (requireValue(values, "CORRALIO_SMS_SEND_MODE") !== "test_allowlist") {
    fail("INVALID_CORRALIO_SMS_SEND_MODE");
  }

  const hmacSecret = decodeHmacSecret(requireValue(values, "CORRALIO_SMS_CHANNEL_HMAC_SECRET"));

  return {
    apiKey,
    profileId,
    publicKey,
    fromNumber,
    allowlist: new Set(allowlist),
    sendMode: "test_allowlist",
    hmacSecret,
    dailyLimit: parseExactInteger(values, "CORRALIO_SMS_TEST_DAILY_SEGMENT_LIMIT", 20),
    destinationDailyLimit: parseExactInteger(
      values,
      "CORRALIO_SMS_TEST_DESTINATION_DAILY_SEGMENT_LIMIT",
      5,
    ),
    maxSegmentsPerMessage: parseExactInteger(values, "CORRALIO_SMS_MAX_SEGMENTS_PER_MESSAGE", 1),
  };
}

export function calculateGsm7Segments(message) {
  if (typeof message !== "string" || message.length === 0) fail("INVALID_SMS_MESSAGE");
  let septets = 0;
  for (const character of message) {
    if (BASIC_GSM7.has(character)) septets += 1;
    else if (EXTENDED_GSM7.has(character)) septets += 2;
    else fail("NON_GSM7_MESSAGE");
  }
  return septets <= 160 ? 1 : Math.ceil(septets / 153);
}

export function destinationBucket(destination, hmacSecret) {
  if (!E164.test(destination)) fail("INVALID_DESTINATION");
  return createHmac("sha256", hmacSecret).update(destination).digest("hex");
}

function utcDay(now) {
  return now.toISOString().slice(0, 10);
}

function emptyLedger(day) {
  return {
    version: 1,
    utcDay: day,
    totalReserved: 0,
    destinations: {},
    reservations: {},
  };
}

function validateLedger(value, day) {
  if (value?.version !== 1 || typeof value.utcDay !== "string") fail("SMS_LEDGER_INVALID");
  if (value.utcDay !== day) return emptyLedger(day);
  if (!Number.isInteger(value.totalReserved) || value.totalReserved < 0) fail("SMS_LEDGER_INVALID");
  if (!value.destinations || typeof value.destinations !== "object") fail("SMS_LEDGER_INVALID");
  if (!value.reservations || typeof value.reservations !== "object") fail("SMS_LEDGER_INVALID");
  return value;
}

async function delay(milliseconds) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function acquireLock(lockPath, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (true) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") fail("SMS_LEDGER_UNAVAILABLE");
      if (Date.now() >= deadline) fail("SMS_LEDGER_UNAVAILABLE");
      await delay(10);
    }
  }
}

async function readLedger(path, day) {
  try {
    return validateLedger(JSON.parse(await readFile(path, "utf8")), day);
  } catch (error) {
    if (error?.code === "ENOENT") return emptyLedger(day);
    if (error instanceof SpikeSafetyError) throw error;
    fail("SMS_LEDGER_INVALID");
  }
}

async function writeLedger(path, ledger) {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(ledger)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, path);
  const directory = await open(parent, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export class PersistentSegmentLedger {
  constructor({ path, hmacSecret, dailyLimit, destinationDailyLimit, lockTimeoutMilliseconds = 2000 }) {
    this.path = resolve(path);
    this.lockPath = `${this.path}.lock`;
    this.hmacSecret = hmacSecret;
    this.dailyLimit = dailyLimit;
    this.destinationDailyLimit = destinationDailyLimit;
    this.lockTimeoutMilliseconds = lockTimeoutMilliseconds;
  }

  async reserve({ destination, segments, now = new Date() }) {
    if (!Number.isInteger(segments) || segments < 1) fail("INVALID_SEGMENT_RESERVATION");
    const bucket = destinationBucket(destination, this.hmacSecret);
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await acquireLock(this.lockPath, this.lockTimeoutMilliseconds);
    try {
      const day = utcDay(now);
      const ledger = await readLedger(this.path, day);
      const destinationReserved = ledger.destinations[bucket] ?? 0;
      if (ledger.totalReserved + segments > this.dailyLimit) fail("SMS_GLOBAL_DAILY_LIMIT");
      if (destinationReserved + segments > this.destinationDailyLimit) {
        fail("SMS_DESTINATION_DAILY_LIMIT");
      }

      const reservationId = randomUUID();
      ledger.totalReserved += segments;
      ledger.destinations[bucket] = destinationReserved + segments;
      ledger.reservations[reservationId] = {
        destinationBucket: bucket,
        segments,
        reservedAt: now.toISOString(),
        status: "reserved",
      };
      await writeLedger(this.path, ledger);
      return { reservationId, totalReserved: ledger.totalReserved, destinationReserved: ledger.destinations[bucket] };
    } finally {
      try {
        await rmdir(this.lockPath);
      } catch {
        // A retained lock fails future reservations closed; never hide the completed reservation.
      }
    }
  }

  async summary({ destination, now = new Date() }) {
    const ledger = await readLedger(this.path, utcDay(now));
    const bucket = destinationBucket(destination, this.hmacSecret);
    return {
      totalReserved: ledger.totalReserved,
      destinationReserved: ledger.destinations[bucket] ?? 0,
      reservationCount: Object.keys(ledger.reservations).length,
    };
  }
}

export function assertOutboundEligible({ config, destination, message }) {
  if (config.sendMode !== "test_allowlist") fail("SMS_SEND_MODE_DISABLED");
  if (!config.allowlist.has(destination)) fail("SMS_DESTINATION_NOT_ALLOWLISTED");
  const segments = calculateGsm7Segments(message);
  if (segments > config.maxSegmentsPerMessage) fail("SMS_MESSAGE_SEGMENT_LIMIT");
  return { segments };
}

export function verifyTelnyxFixture({ rawBody, signature, timestamp, publicKey, nowSeconds, seenEventIds }) {
  if (!rawBody || !signature || !timestamp) fail("TELNYX_SIGNATURE_HEADERS_MISSING");
  if (!/^\d+$/.test(timestamp)) fail("TELNYX_TIMESTAMP_INVALID");
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > 300) {
    fail("TELNYX_TIMESTAMP_STALE");
  }
  let signatureBytes;
  try {
    signatureBytes = Buffer.from(signature, "base64");
  } catch {
    fail("TELNYX_SIGNATURE_INVALID");
  }
  const valid = verifySignature(
    null,
    Buffer.from(`${timestamp}|${rawBody}`, "utf8"),
    publicKey,
    signatureBytes,
  );
  if (!valid) fail("TELNYX_SIGNATURE_INVALID");

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    fail("TELNYX_PAYLOAD_INVALID");
  }
  const eventId = event?.data?.id;
  const eventType = event?.data?.event_type;
  if (typeof eventId !== "string" || !eventId) fail("TELNYX_EVENT_ID_MISSING");
  if (!["message.received", "message.sent", "message.finalized"].includes(eventType)) {
    fail("TELNYX_EVENT_TYPE_UNSUPPORTED");
  }
  if (seenEventIds.has(eventId)) fail("TELNYX_EVENT_REPLAY");
  seenEventIds.add(eventId);
  return { eventType };
}

async function workerMain() {
  const [, , command, path, destination, dailyRaw, destinationRaw] = process.argv;
  if (command !== "reserve-test") return;
  const ledger = new PersistentSegmentLedger({
    path,
    hmacSecret: Buffer.alloc(32, 7),
    dailyLimit: Number(dailyRaw),
    destinationDailyLimit: Number(destinationRaw),
  });
  try {
    await ledger.reserve({ destination, segments: 1, now: new Date("2026-08-31T12:00:00.000Z") });
    process.stdout.write("RESERVED\n");
  } catch (error) {
    process.stdout.write(`${error?.code === "SMS_GLOBAL_DAILY_LIMIT" ? "DENIED" : "ERROR"}\n`);
    process.exitCode = error?.code === "SMS_GLOBAL_DAILY_LIMIT" ? 2 : 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await workerMain();
}
