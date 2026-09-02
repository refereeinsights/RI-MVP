import type { SmsDurableSafetyGateway } from "./durableSafety";
import { authorizeSmsOtpRequest, normalizeSmsPhone } from "./durableSafety";

const SUPABASE_HOST = /^([a-z0-9]+)\.supabase\.co$/;
const ASCII_VISIBLE = /^[\x21-\x7e]+$/;
const JWT_SEGMENT = /^[A-Za-z0-9_-]+$/;

export type Gate3SupabaseErrorCategory =
  | "captcha"
  | "hook_contract"
  | "hook_timeout"
  | "phone_configuration"
  | "rate_limit"
  | "sms_send"
  | "user_state"
  | "unexpected_failure"
  | "unknown_auth_error";

export type Gate3SupabaseAuthDiagnostic = {
  httpStatus: number | null;
  code: string | null;
  name: "AuthApiError" | "AuthError" | "CustomAuthError" | "UnknownAuthError";
  category: Gate3SupabaseErrorCategory;
};

const SAFE_AUTH_NAMES = new Set(["AuthApiError", "AuthError", "CustomAuthError"]);
const SAFE_AUTH_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const HOOK_CONTRACT_CODES = new Set(["bad_json", "hook_payload_invalid_content_type", "hook_payload_over_size_limit"]);
const HOOK_TIMEOUT_CODES = new Set(["hook_timeout", "hook_timeout_after_retry", "request_timeout"]);
const PHONE_CONFIGURATION_CODES = new Set(["otp_disabled", "phone_provider_disabled", "provider_disabled"]);
const RATE_LIMIT_CODES = new Set(["over_request_rate_limit", "over_sms_send_rate_limit"]);
const USER_STATE_CODES = new Set(["phone_not_confirmed", "signup_disabled", "user_not_found"]);

export function sanitizeSupabaseAuthError(error: unknown): Gate3SupabaseAuthDiagnostic {
  const value = error && typeof error === "object"
    ? error as { status?: unknown; code?: unknown; name?: unknown }
    : {};
  const httpStatus = typeof value.status === "number"
    && Number.isInteger(value.status) && value.status >= 400 && value.status <= 599
    ? value.status
    : null;
  const code = typeof value.code === "string" && SAFE_AUTH_CODE.test(value.code) ? value.code : null;
  const name = typeof value.name === "string" && SAFE_AUTH_NAMES.has(value.name)
    ? value.name as Gate3SupabaseAuthDiagnostic["name"]
    : "UnknownAuthError";
  let category: Gate3SupabaseErrorCategory = "unknown_auth_error";
  if (code === "captcha_failed") category = "captcha";
  else if (code && HOOK_CONTRACT_CODES.has(code)) category = "hook_contract";
  else if (code && HOOK_TIMEOUT_CODES.has(code)) category = "hook_timeout";
  else if (code && PHONE_CONFIGURATION_CODES.has(code)) category = "phone_configuration";
  else if (code && RATE_LIMIT_CODES.has(code)) category = "rate_limit";
  else if (code === "sms_send_failed") category = "sms_send";
  else if (code && USER_STATE_CODES.has(code)) category = "user_state";
  else if (code === "unexpected_failure") category = "unexpected_failure";
  return { httpStatus, code, name, category };
}

export function sanitizeOpaqueRequestId(value: string | null): string | null {
  const candidate = value?.trim() ?? "";
  return /^[A-Za-z0-9_-]{8,128}$/.test(candidate) ? candidate : null;
}

export function createGate3SendSmsSuccessResponse(mockInvocations: number) {
  return new Response(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "x-corralio-gate3-mock-invocations": String(mockInvocations),
    },
  });
}

const ISOLATED_CONFIGURATION_ERRORS = new Set([
  "Provider credentials are prohibited in the isolated runtime",
  "Isolated SMS runtime is disabled",
  "Isolated Supabase identity is invalid",
  "Isolated Supabase public key is invalid",
  "Isolated Supabase configuration is incomplete",
  "Isolated HMAC configuration is unavailable",
  "Isolated hook verification configuration is unavailable",
]);

export function sanitizeIsolatedConfigurationError(error: unknown) {
  return error instanceof Error && ISOLATED_CONFIGURATION_ERRORS.has(error.message)
    ? error.message
    : "Unknown isolated configuration error";
}

export function assertIsolatedSupabasePublicKey(value: string | undefined, expectedRef: string) {
  const key = value ?? "";
  if (!key || !ASCII_VISIBLE.test(key) || key.trim() !== key) {
    throw new Error("Isolated Supabase public key is invalid");
  }
  const segments = key.split(".");
  if (segments.length !== 3 || segments.some((segment) => !JWT_SEGMENT.test(segment))) {
    throw new Error("Isolated Supabase public key is invalid");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("Isolated Supabase public key is invalid");
  }
  const claims = payload && typeof payload === "object"
    ? payload as { iss?: unknown; ref?: unknown; role?: unknown }
    : {};
  if (claims.iss !== "supabase" || claims.role !== "anon" || claims.ref !== expectedRef) {
    throw new Error("Isolated Supabase public key is invalid");
  }
}

export function assertIsolatedSmsRuntimeConfiguration(env: NodeJS.ProcessEnv) {
  if (env.CORRALIO_GATE3_ISOLATED_RUNTIME !== "1" || env.CORRALIO_GATE3_MOCK_PROVIDER !== "1") {
    throw new Error("Isolated SMS runtime is disabled");
  }
  if (Object.entries(env).some(([name, value]) => name.startsWith("TELNYX_") && value?.trim())) {
    throw new Error("Provider credentials are prohibited in the isolated runtime");
  }
  const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const actualRef = url.hostname.match(SUPABASE_HOST)?.[1];
  const expectedRef = env.CORRALIO_GATE3_ISOLATED_SUPABASE_REF?.trim();
  const forbiddenRefs = new Set(
    (env.CORRALIO_GATE3_FORBIDDEN_SUPABASE_REFS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!actualRef || !expectedRef || actualRef !== expectedRef || forbiddenRefs.has(actualRef)) {
    throw new Error("Isolated Supabase identity is invalid");
  }
  assertIsolatedSupabasePublicKey(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, actualRef);
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || !env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error("Isolated Supabase configuration is incomplete");
  }
  if (!env.CORRALIO_SMS_CHANNEL_HMAC_SECRET || Buffer.byteLength(env.CORRALIO_SMS_CHANNEL_HMAC_SECRET) < 32) {
    throw new Error("Isolated HMAC configuration is unavailable");
  }
  if (!env.CORRALIO_SMS_SEND_HOOK_SECRET?.trim()) {
    throw new Error("Isolated hook verification configuration is unavailable");
  }
  const siteOrigin = new URL(env.CORRALIO_SITE_URL ?? "").origin;
  return { actualRef, siteOrigin };
}

export async function requestIsolatedSmsOtp(input: {
  request: Request;
  phone: string;
  captchaToken: string;
  expectedOrigin: string;
  hmacSecret: string;
  gateway: SmsDurableSafetyGateway;
  signInWithOtp: (input: { phone: string; captchaToken: string }) => Promise<{ error: unknown }>;
  isVercelRuntime?: boolean;
}) {
  if (!input.captchaToken || input.captchaToken.length > 4096) return { status: "denied" as const };
  let normalizedPhone: string;
  try {
    normalizedPhone = normalizeSmsPhone(input.phone);
  } catch {
    return { status: "denied" as const };
  }
  const authorization = await authorizeSmsOtpRequest({
    request: input.request,
    expectedOrigin: input.expectedOrigin,
    phone: normalizedPhone,
    hmacSecret: input.hmacSecret,
    gateway: input.gateway,
    isVercelRuntime: input.isVercelRuntime,
  });
  if (authorization.status !== "authorized") return { status: "denied" as const };

  try {
    const result = await input.signInWithOtp({ phone: normalizedPhone, captchaToken: input.captchaToken });
    return result.error ? { status: "denied" as const } : { status: "pending" as const };
  } catch {
    return { status: "denied" as const };
  }
}
