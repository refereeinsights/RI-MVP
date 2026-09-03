import { createPublicKey, verify } from "node:crypto";

import { normalizeSmsPhone } from "./durableSafety";

const RAW_ED25519_SPKI_PREFIX = [48, 42, 48, 5, 6, 3, 43, 101, 112, 3, 33, 0] as const;

function exactBuffer(value: Uint8Array) {
  const exact = new Uint8Array(new ArrayBuffer(value.byteLength));
  exact.set(value);
  return Buffer.from(exact.buffer);
}

function exactView(value: ArrayLike<number>) {
  const exact = new Uint8Array(new ArrayBuffer(value.length));
  for (let index = 0; index < value.length; index += 1) exact[index] = value[index];
  return new DataView(exact.buffer);
}

export type TelnyxInboundMessage = {
  eventId: string;
  senderPhone: string;
  text: string;
};

function publicKey(value: string | undefined) {
  if (!value?.trim()) throw new Error("telnyx_public_key_unavailable");
  if (value.includes("BEGIN PUBLIC KEY")) return createPublicKey(value);
  const raw = Buffer.from(value.trim(), "base64");
  if (raw.length !== 32) throw new Error("telnyx_public_key_invalid");
  const der = new Uint8Array(new ArrayBuffer(RAW_ED25519_SPKI_PREFIX.length + raw.length));
  RAW_ED25519_SPKI_PREFIX.forEach((byte, index) => { der[index] = byte; });
  for (let index = 0; index < raw.length; index += 1) der[index + RAW_ED25519_SPKI_PREFIX.length] = raw[index];
  return createPublicKey({
    key: exactBuffer(der),
    format: "der",
    type: "spki",
  });
}

export function verifyAndParseTelnyxInbound(input: {
  rawBody: string;
  headers: Headers;
  publicKey: string | undefined;
  nowSeconds?: number;
}): TelnyxInboundMessage {
  if (Buffer.byteLength(input.rawBody, "utf8") > 16_384) throw new Error("payload_too_large");
  const timestamp = input.headers.get("telnyx-timestamp")?.trim() ?? "";
  const signature = input.headers.get("telnyx-signature-ed25519")?.trim() ?? "";
  if (!/^\d{10}$/.test(timestamp) || !signature) throw new Error("signature_headers_invalid");
  const seconds = Number(timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(seconds) || Math.abs(now - seconds) > 300) throw new Error("timestamp_invalid");
  const signatureBytes = Buffer.from(signature, "base64");
  if (signatureBytes.length !== 64 || !verify(
    null,
    exactView(new TextEncoder().encode(`${timestamp}|${input.rawBody}`)),
    publicKey(input.publicKey),
    exactView(signatureBytes),
  )) throw new Error("signature_invalid");

  let parsed: unknown;
  try { parsed = JSON.parse(input.rawBody); } catch { throw new Error("payload_invalid"); }
  const event = parsed as {
    data?: {
      id?: unknown;
      event_type?: unknown;
      payload?: { from?: { phone_number?: unknown }; text?: unknown };
    };
  };
  if (event.data?.event_type !== "message.received"
    || typeof event.data.id !== "string"
    || !/^[A-Za-z0-9_-]{1,128}$/.test(event.data.id)
    || typeof event.data.payload?.from?.phone_number !== "string"
    || typeof event.data.payload.text !== "string"
    || event.data.payload.text.length > 4096) throw new Error("payload_invalid");
  return {
    eventId: event.data.id,
    senderPhone: normalizeSmsPhone(event.data.payload.from.phone_number),
    text: event.data.payload.text,
  };
}

export function parseSmsIntakeContent(text: string):
  | { kind: "url"; url: string }
  | { kind: "choice"; choice: number }
  | { kind: "cancel" }
  | { kind: "invalid" } {
  const trimmed = text.trim();
  if (/^cancel$/i.test(trimmed)) return { kind: "cancel" };
  if (/^[1-9]\d?$/.test(trimmed)) return { kind: "choice", choice: Number(trimmed) };
  const matches = trimmed.match(/(?:https?|webcal):\/\/[^\s<>]+/gi) ?? [];
  return matches.length === 1 && matches[0] === trimmed
    ? { kind: "url", url: matches[0] }
    : { kind: "invalid" };
}
