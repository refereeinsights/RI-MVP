import type { SmsDurableSafetyGateway } from "./durableSafety";
import { authorizeSmsOtpRequest, normalizeSmsPhone } from "./durableSafety";

const SUPABASE_HOST = /^([a-z0-9]+)\.supabase\.co$/;

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
