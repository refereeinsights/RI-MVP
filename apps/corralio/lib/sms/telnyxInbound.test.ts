import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import { parseSmsIntakeContent, verifyAndParseTelnyxInbound } from "./telnyxInbound";

test("Telnyx raw-body signature, timestamp, and bounded payload are verified", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const timestamp = "1788278400";
  const rawBody = JSON.stringify({ data: {
    id: "event_fixture_1", event_type: "message.received",
    payload: { from: { phone_number: "+15095550123" }, text: "https://example.invalid/team.ics" },
  } });
  const bytes = new TextEncoder().encode(`${timestamp}|${rawBody}`);
  const signature = sign(null, new DataView(bytes.buffer), privateKey).toString("base64");
  const headers = new Headers({ "telnyx-timestamp": timestamp, "telnyx-signature-ed25519": signature });
  assert.deepEqual(verifyAndParseTelnyxInbound({
    rawBody, headers, publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(), nowSeconds: 1788278400,
  }), { eventId: "event_fixture_1", senderPhone: "+15095550123", text: "https://example.invalid/team.ics" });
  assert.throws(() => verifyAndParseTelnyxInbound({ rawBody: `${rawBody} `, headers, publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(), nowSeconds: 1788278400 }));
});

test("SMS content accepts one URL or one bounded reply only", () => {
  assert.deepEqual(parseSmsIntakeContent("https://example.invalid/team.ics"), { kind: "url", url: "https://example.invalid/team.ics" });
  assert.deepEqual(parseSmsIntakeContent("2"), { kind: "choice", choice: 2 });
  assert.deepEqual(parseSmsIntakeContent("CANCEL"), { kind: "cancel" });
  assert.deepEqual(parseSmsIntakeContent("please use https://example.invalid/team.ics"), { kind: "invalid" });
  assert.deepEqual(parseSmsIntakeContent("https://a.invalid/a.ics https://b.invalid/b.ics"), { kind: "invalid" });
});
