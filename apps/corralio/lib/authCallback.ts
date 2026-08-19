export type CorralioOtpType = "email" | "magiclink" | "recovery";

const SUPPORTED_OTP_TYPES = new Set<CorralioOtpType>(["email", "magiclink", "recovery"]);

export type CorralioAuthCallback =
  | { valid: false; recovery: false; otpType: null }
  | { valid: true; recovery: boolean; otpType: CorralioOtpType | null };

export function resolveCorralioAuthCallback(input: {
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  flow: string | null;
}): CorralioAuthCallback {
  const otpType = SUPPORTED_OTP_TYPES.has(input.type as CorralioOtpType)
    ? input.type as CorralioOtpType
    : null;
  const recovery = otpType === "recovery" || input.flow === "recovery";

  if (input.code) return { valid: true, recovery, otpType: null };
  if (input.tokenHash && otpType) return { valid: true, recovery, otpType };
  return { valid: false, recovery: false, otpType: null };
}
