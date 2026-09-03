import { createHmac } from "node:crypto";

import { normalizeSmsPhone } from "./sms/durableSafety";

export type PhoneAuthConfiguration = {
  enabled: boolean;
  siteKey: string | null;
};

export function readPhoneAuthConfiguration(environment: NodeJS.ProcessEnv): PhoneAuthConfiguration {
  const siteKey = environment.NEXT_PUBLIC_CORRALIO_TURNSTILE_SITE_KEY?.trim() || null;
  return {
    enabled: environment.CORRALIO_PHONE_AUTH_ENABLED === "true" && siteKey !== null,
    siteKey,
  };
}

export function deriveChannelAddressHmac(
  secret: string | undefined,
  channel: "phone" | "email",
  normalizedAddress: string,
) {
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Channel identity configuration is unavailable");
  }
  return createHmac("sha256", secret)
    .update(`corralio:channel-identity:${channel}:v1\0`, "utf8")
    .update(normalizedAddress, "utf8")
    .digest("hex");
}

export function normalizeVerifiedPhone(value: string) {
  return normalizeSmsPhone(value);
}

export function parseManualOtp(value: unknown) {
  const token = String(value ?? "").trim();
  return /^\d{6}$/.test(token) ? token : null;
}
