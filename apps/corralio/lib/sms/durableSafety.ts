import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export type SmsSafetyDecision =
  | "authorized"
  | "duplicate"
  | "missing_permit"
  | "expired_permit"
  | "rate_limited"
  | "cooldown"
  | "global_cap"
  | "destination_cap"
  | "invalid_mode"
  | "policy_disabled"
  | "not_allowlisted"
  | "segment_limit"
  | "blocked";

export type SmsHookResult =
  | {
      status: "denied";
      decision: Exclude<SmsSafetyDecision, "authorized">;
      failureClass: "terminal" | "transient";
      preAuthorizationCategory?: SmsPreAuthorizationFailureCategory;
    }
  | { status: "attempted"; decision: "authorized"; providerOutcome: "accepted" | "rejected" | "unknown" };

export interface SmsDurableSafetyGateway {
  authorizeOtpRequest(input: { destinationHmac: string; ipHmac: string }): Promise<SmsSafetyDecision>;
  authorizeHookAttempt(input: {
    webhookId: string;
    destinationHmac: string;
    segments: number;
  }): Promise<SmsSafetyDecision>;
}

export interface SmsProviderAdapter {
  send(input: { destination: string; message: string }): Promise<{ outcome: "accepted" | "rejected" }>;
}

export type SmsPreAuthorizationFailureCategory =
  | "hook_secret_unavailable"
  | "header_contract_invalid"
  | "timestamp_invalid"
  | "signature_mismatch"
  | "payload_json_invalid"
  | "payload_shape_invalid"
  | "phone_invalid"
  | "otp_invalid"
  | "unknown_pre_authorization_failure";

class SmsPreAuthorizationError extends Error {
  constructor(readonly category: SmsPreAuthorizationFailureCategory) {
    super("Send SMS Hook pre-authorization failed");
  }
}

function normalizeIpv4(value: string) {
  return value.split(".").map((part) => String(Number(part))).join(".");
}

export function normalizeTrustedIp(value: string): string {
  const candidate = value.trim().replace(/^\[|\]$/g, "");
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(candidate)) {
    const parts = candidate.split(".").map(Number);
    if (parts.every((part) => part >= 0 && part <= 255)) return parts.map(String).join(".");
  }
  const version = isIP(candidate);
  if (version === 4) return normalizeIpv4(candidate);
  if (version === 6) {
    const hostname = new URL(`http://[${candidate}]/`).hostname;
    return hostname.slice(1, -1).toLowerCase();
  }
  throw new Error("Trusted client IP is invalid");
}

export function normalizeSmsPhone(value: string): string {
  const compact = value.trim().replace(/[\s().-]/g, "");
  const candidate = /^\d{10}$/.test(compact)
    ? `+1${compact}`
    : /^1\d{10}$/.test(compact)
      ? `+${compact}`
      : compact;
  if (!/^\+[1-9]\d{7,14}$/.test(candidate)) throw new Error("Phone is invalid");
  return candidate;
}

export function deriveSmsSafetyHmac(
  secret: string | undefined,
  kind: "destination" | "ip",
  normalizedValue: string,
): string {
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) throw new Error("SMS safety configuration is unavailable");
  return createHmac("sha256", secret)
    .update(`corralio:sms:${kind}:v1\0`, "utf8")
    .update(normalizedValue, "utf8")
    .digest("hex");
}

export function readTrustedVercelClientIp(request: Request, isVercelRuntime = process.env.VERCEL === "1") {
  if (!isVercelRuntime) throw new Error("Trusted client IP is unavailable");
  const raw = request.headers.get("x-vercel-forwarded-for");
  if (!raw || raw.includes(",")) throw new Error("Trusted client IP is unavailable");
  return normalizeTrustedIp(raw);
}

export function assertSameOriginRequest(request: Request, expectedOrigin: string) {
  const expected = new URL(expectedOrigin).origin;
  const supplied = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!supplied || new URL(supplied).origin !== expected || (fetchSite && fetchSite !== "same-origin")) {
    throw new Error("Request origin is not authorized");
  }
}

export async function authorizeSmsOtpRequest(input: {
  request: Request;
  expectedOrigin: string;
  phone: string;
  hmacSecret: string | undefined;
  gateway: SmsDurableSafetyGateway;
  isVercelRuntime?: boolean;
}): Promise<{ status: "authorized" | "denied" }> {
  try {
    assertSameOriginRequest(input.request, input.expectedOrigin);
    const phone = normalizeSmsPhone(input.phone);
    const ip = readTrustedVercelClientIp(input.request, input.isVercelRuntime);
    const decision = await input.gateway.authorizeOtpRequest({
      destinationHmac: deriveSmsSafetyHmac(input.hmacSecret, "destination", phone),
      ipHmac: deriveSmsSafetyHmac(input.hmacSecret, "ip", ip),
    });
    return decision === "authorized" ? { status: "authorized" } : { status: "denied" };
  } catch {
    return { status: "denied" };
  }
}

function parseWebhookSecret(secret: string) {
  const encoded = secret.trim().replace(/^v1,/, "").replace(/^whsec_/, "");
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length < 16) throw new SmsPreAuthorizationError("hook_secret_unavailable");
  return new Uint8Array([...decoded]);
}

export function verifyStandardWebhook(input: {
  rawBody: string;
  headers: Headers;
  secret: string | undefined;
  nowSeconds?: number;
}): { webhookId: string } {
  const webhookId = input.headers.get("webhook-id")?.trim() ?? "";
  const timestamp = input.headers.get("webhook-timestamp")?.trim() ?? "";
  const signatures = input.headers.get("webhook-signature")?.split(/\s+/) ?? [];
  if (!input.secret) throw new SmsPreAuthorizationError("hook_secret_unavailable");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(webhookId) || signatures.length === 0) {
    throw new SmsPreAuthorizationError("header_contract_invalid");
  }
  if (!/^\d{10}$/.test(timestamp)) throw new SmsPreAuthorizationError("timestamp_invalid");
  const seconds = Number(timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(seconds) || Math.abs(now - seconds) > 300) {
    throw new SmsPreAuthorizationError("timestamp_invalid");
  }
  const expected = createHmac("sha256", parseWebhookSecret(input.secret))
    .update(`${webhookId}.${timestamp}.${input.rawBody}`)
    .digest();
  const valid = signatures.some((entry) => {
    const encoded = entry.replace(/^v1,/, "");
    let actual: Buffer;
    try { actual = Buffer.from(encoded, "base64"); } catch { return false; }
    return actual.length === expected.length
      && timingSafeEqual(new Uint8Array([...actual]), new Uint8Array([...expected]));
  });
  if (!valid) throw new SmsPreAuthorizationError("signature_mismatch");
  return { webhookId };
}

const GSM7_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
const GSM7_EXTENSION = new Set("^{}\\[~]|€");

export function countGsm7Segments(message: string) {
  let septets = 0;
  for (const character of message) {
    if (GSM7_BASIC.has(character)) septets += 1;
    else if (GSM7_EXTENSION.has(character)) septets += 2;
    else return { encoding: "ucs2" as const, units: [...message].length, segments: Math.ceil([...message].length / 67) };
  }
  return {
    encoding: "gsm7" as const,
    units: septets,
    segments: septets <= 160 ? 1 : Math.ceil(septets / 153),
  };
}

function parseSendSmsPayload(rawBody: string) {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    throw new SmsPreAuthorizationError("payload_json_invalid");
  }
  if (!value || typeof value !== "object") throw new SmsPreAuthorizationError("payload_shape_invalid");
  const row = value as { user?: { phone?: unknown }; sms?: { otp?: unknown } };
  if (typeof row.user?.phone !== "string" || typeof row.sms?.otp !== "string") {
    throw new SmsPreAuthorizationError("payload_shape_invalid");
  }
  if (!/^\d{4,10}$/.test(row.sms.otp)) throw new SmsPreAuthorizationError("otp_invalid");
  try {
    return { phone: normalizeSmsPhone(row.user.phone), otp: row.sms.otp };
  } catch {
    throw new SmsPreAuthorizationError("phone_invalid");
  }
}

export async function handleVerifiedSmsHook(input: {
  rawBody: string;
  headers: Headers;
  webhookSecret: string | undefined;
  hmacSecret: string | undefined;
  gateway: SmsDurableSafetyGateway;
  provider: SmsProviderAdapter;
  nowSeconds?: number;
}): Promise<SmsHookResult> {
  let verified: { webhookId: string };
  let payload: { phone: string; otp: string };
  try {
    verified = verifyStandardWebhook({
      rawBody: input.rawBody,
      headers: input.headers,
      secret: input.webhookSecret,
      nowSeconds: input.nowSeconds,
    });
    payload = parseSendSmsPayload(input.rawBody);
  } catch (error) {
    return {
      status: "denied",
      decision: "blocked",
      failureClass: "terminal",
      preAuthorizationCategory: error instanceof SmsPreAuthorizationError
        ? error.category
        : "unknown_pre_authorization_failure",
    };
  }
  const message = `Your Corralio verification code is ${payload.otp}.`;
  let decision: SmsSafetyDecision;
  try {
    decision = await input.gateway.authorizeHookAttempt({
      webhookId: verified.webhookId,
      destinationHmac: deriveSmsSafetyHmac(input.hmacSecret, "destination", payload.phone),
      segments: countGsm7Segments(message).segments,
    });
  } catch {
    return { status: "denied", decision: "blocked", failureClass: "transient" };
  }
  if (decision !== "authorized") {
    return { status: "denied", decision, failureClass: "terminal" };
  }

  try {
    const result = await input.provider.send({ destination: payload.phone, message });
    return { status: "attempted", decision: "authorized", providerOutcome: result.outcome };
  } catch {
    // Authorization and its segment remain permanent. No retry is attempted here.
    return { status: "attempted", decision: "authorized", providerOutcome: "unknown" };
  }
}
