import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import {
  assertOutboundEligible,
  calculateGsm7Segments,
} from "./corralio_sms_telnyx_spike_safety.mjs";

export const TEST_ONLY_OTP_LIMITS = Object.freeze({
  requestsPerIpPerHour: 5,
  requestsPerPhonePerHour: 3,
  resendCooldownSeconds: 60,
  verificationAttemptsPerChallenge: 5,
});

export const ENUMERATION_SAFE_REQUEST_RESULT = Object.freeze({
  ok: true,
  message: "If this phone can be used, a code will be sent.",
});

const US_E164 = /^\+1([2-9]\d{2})([2-9]\d{2})(\d{4})$/;
const STANDARD_WEBHOOK_SECRET = /^v1,whsec_([A-Za-z0-9+/]+={0,2})$/;

export class Gate3SafetyError extends Error {
  constructor(code) {
    super(code);
    this.name = "Gate3SafetyError";
    this.code = code;
  }
}

function fail(code) {
  throw new Gate3SafetyError(code);
}

export function normalizeTestUsE164(value) {
  if (typeof value !== "string") fail("PHONE_INVALID");
  const normalized = value.trim();
  if (!US_E164.test(normalized)) {
    fail(/^\+[2-9]/.test(normalized) ? "PHONE_GEOGRAPHY_UNSUPPORTED" : "PHONE_INVALID");
  }
  return normalized;
}

export function assertTurnstileFixture({ token, result, expectedAction, allowedHostnames }) {
  if (typeof token !== "string" || token.length === 0) fail("TURNSTILE_PROOF_MISSING");
  if (token.length > 2048) fail("TURNSTILE_PROOF_INVALID");
  if (!result || result.success !== true) fail("TURNSTILE_PROOF_REJECTED");
  if (result.action !== expectedAction) fail("TURNSTILE_ACTION_MISMATCH");
  if (!(allowedHostnames instanceof Set) || !allowedHostnames.has(result.hostname)) {
    fail("TURNSTILE_HOSTNAME_MISMATCH");
  }
  return { accepted: true };
}

export function assertOtpRequestAllowed({ state, nowSeconds, limits = TEST_ONLY_OTP_LIMITS }) {
  if (!state || state.available !== true) fail("OTP_LIMIT_STATE_UNAVAILABLE");
  if (!Number.isInteger(state.ipRequestsInWindow) || state.ipRequestsInWindow < 0) {
    fail("OTP_LIMIT_STATE_INVALID");
  }
  if (!Number.isInteger(state.phoneRequestsInWindow) || state.phoneRequestsInWindow < 0) {
    fail("OTP_LIMIT_STATE_INVALID");
  }
  if (state.ipRequestsInWindow >= limits.requestsPerIpPerHour) fail("OTP_IP_LIMIT");
  if (state.phoneRequestsInWindow >= limits.requestsPerPhonePerHour) fail("OTP_PHONE_LIMIT");
  if (
    Number.isFinite(state.lastPhoneRequestAtSeconds) &&
    nowSeconds - state.lastPhoneRequestAtSeconds < limits.resendCooldownSeconds
  ) {
    fail("OTP_RESEND_COOLDOWN");
  }
  return { allowed: true };
}

export function assertOtpVerificationAllowed({ state, limits = TEST_ONLY_OTP_LIMITS }) {
  if (!state || state.available !== true) fail("OTP_VERIFY_STATE_UNAVAILABLE");
  if (!Number.isInteger(state.failedAttempts) || state.failedAttempts < 0) {
    fail("OTP_VERIFY_STATE_INVALID");
  }
  if (state.failedAttempts >= limits.verificationAttemptsPerChallenge) {
    fail("OTP_VERIFY_ATTEMPT_LIMIT");
  }
  return { allowed: true };
}

function parseStandardWebhookSecret(serialized) {
  const match = typeof serialized === "string" ? serialized.match(STANDARD_WEBHOOK_SECRET) : null;
  if (!match) fail("SUPABASE_HOOK_SECRET_INVALID");
  const secret = Buffer.from(match[1], "base64");
  if (secret.length < 24) fail("SUPABASE_HOOK_SECRET_INVALID");
  return secret;
}

export function signStandardWebhookFixture({ rawBody, webhookId, timestamp, serializedSecret }) {
  const secret = parseStandardWebhookSecret(serializedSecret);
  return `v1,${createHmac("sha256", secret)
    .update(`${webhookId}.${timestamp}.${rawBody}`)
    .digest("base64")}`;
}

export function verifySupabaseSendSmsHookFixture({
  rawBody,
  headers,
  serializedSecret,
  nowSeconds,
  seenWebhookIds,
}) {
  const webhookId = headers?.["webhook-id"];
  const timestamp = headers?.["webhook-timestamp"];
  const signatureHeader = headers?.["webhook-signature"];
  if (!webhookId || !timestamp || !signatureHeader) fail("SUPABASE_HOOK_HEADERS_MISSING");
  if (webhookId.includes(".") || !/^\d+$/.test(timestamp)) fail("SUPABASE_HOOK_HEADERS_INVALID");
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > 300) {
    fail("SUPABASE_HOOK_TIMESTAMP_STALE");
  }

  const secret = parseStandardWebhookSecret(serializedSecret);
  const expected = createHmac("sha256", secret)
    .update(`${webhookId}.${timestamp}.${rawBody}`)
    .digest();
  const signatures = signatureHeader.split(" ").flatMap((entry) => {
    const [version, encoded] = entry.split(",", 2);
    if (version !== "v1" || !encoded) return [];
    try {
      return [Buffer.from(encoded, "base64")];
    } catch {
      return [];
    }
  });
  if (!signatures.some((signature) => (
    signature.length === expected.length && timingSafeEqual(signature, expected)
  ))) {
    fail("SUPABASE_HOOK_SIGNATURE_INVALID");
  }
  if (seenWebhookIds.has(webhookId)) fail("SUPABASE_HOOK_REPLAY");

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    fail("SUPABASE_HOOK_PAYLOAD_INVALID");
  }
  const destination = normalizeTestUsE164(event?.user?.phone);
  const otp = event?.sms?.otp;
  if (typeof otp !== "string" || !/^\d{6,10}$/.test(otp)) fail("SUPABASE_HOOK_OTP_INVALID");
  seenWebhookIds.add(webhookId);
  return { destination, otp, webhookId };
}

export function buildTestOtpMessage(otp) {
  if (typeof otp !== "string" || !/^\d{6,10}$/.test(otp)) fail("SUPABASE_HOOK_OTP_INVALID");
  const message = `Corralio code: ${otp}. It expires soon. Do not share this code.`;
  if (calculateGsm7Segments(message) !== 1) fail("OTP_MESSAGE_SEGMENT_LIMIT");
  return message;
}

export async function runMockSendSmsHook({
  verifiedHook,
  smsConfig,
  ledger,
  provider,
}) {
  const message = buildTestOtpMessage(verifiedHook.otp);
  const { segments } = assertOutboundEligible({
    config: smsConfig,
    destination: verifiedHook.destination,
    message,
  });
  const reservation = await ledger.reserve({
    destination: verifiedHook.destination,
    segments,
    now: new Date("2026-08-31T12:00:00.000Z"),
  });
  try {
    const result = await provider.send({
      destination: verifiedHook.destination,
      message,
      segments,
    });
    if (result?.accepted !== true) fail("TELNYX_PROVIDER_NOT_ACCEPTED");
    return { ok: true, reservationId: reservation.reservationId };
  } catch (error) {
    if (error instanceof Gate3SafetyError) throw error;
    fail("TELNYX_PROVIDER_UNAVAILABLE");
  }
}
