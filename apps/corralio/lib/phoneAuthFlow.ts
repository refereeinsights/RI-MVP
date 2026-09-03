import { normalizeVerifiedPhone, parseManualOtp } from "./phoneAuth";

export async function requestPhoneOtpWithDependencies(input: {
  phone: string;
  captchaToken: string;
  authorize(): Promise<boolean>;
  signInWithOtp(input: { phone: string; captchaToken: string; shouldCreateUser: true }): Promise<{ error: unknown }>;
}) {
  if (!input.captchaToken.trim() || !await input.authorize()) return { status: "denied" as const };
  try {
    const phone = normalizeVerifiedPhone(input.phone);
    const { error } = await input.signInWithOtp({
      phone,
      captchaToken: input.captchaToken,
      shouldCreateUser: true,
    });
    return { status: error ? "denied" as const : "pending" as const };
  } catch {
    return { status: "denied" as const };
  }
}

export async function verifyPhoneOtpWithDependencies(input: {
  submittedPhone: string;
  token: unknown;
  verificationType?: "sms" | "phone_change";
  verify(input: { phone: string; token: string; type: "sms" | "phone_change" }): Promise<{
    error: unknown;
    user: { id: string; phone?: string | null; phoneConfirmedAt?: string | null } | null;
  }>;
  ensureHousehold(): Promise<string | null>;
  project(input: { userId: string; householdId: string; verifiedPhone: string }): Promise<void>;
}) {
  const token = parseManualOtp(input.token);
  if (!token) return { status: "denied" as const };
  try {
    const submittedPhone = normalizeVerifiedPhone(input.submittedPhone);
    const verified = await input.verify({ phone: submittedPhone, token, type: input.verificationType ?? "sms" });
    const user = verified.user;
    if (verified.error || !user?.id || !user.phone || !user.phoneConfirmedAt) {
      return { status: "denied" as const };
    }
    const verifiedPhone = normalizeVerifiedPhone(user.phone);
    if (verifiedPhone !== submittedPhone) return { status: "denied" as const };
    const householdId = await input.ensureHousehold();
    if (!householdId) return { status: "denied" as const };
    await input.project({ userId: user.id, householdId, verifiedPhone });
    return { status: "verified" as const };
  } catch {
    return { status: "denied" as const };
  }
}

export async function requestPhoneChangeWithDependencies(input: {
  phone: string;
  authorize(): Promise<boolean>;
  updatePhone(phone: string): Promise<{ error: unknown }>;
}) {
  if (!await input.authorize()) return { status: "denied" as const };
  try {
    const { error } = await input.updatePhone(normalizeVerifiedPhone(input.phone));
    return { status: error ? "denied" as const : "pending" as const };
  } catch {
    return { status: "denied" as const };
  }
}
