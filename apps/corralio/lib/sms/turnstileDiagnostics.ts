export const TURNSTILE_TOKEN_MAX_AGE_MS = 300_000;

export type Gate3TurnstileTokenState = {
  token: string;
  issuedAtMs: number;
  claimed: boolean;
};

export type Gate3TurnstileTokenClaim =
  | { category: "ready"; token: string; nextState: Gate3TurnstileTokenState }
  | { category: "missing_token" | "expired_or_reused_token"; token: null; nextState: null };

export type Gate3CaptchaDiagnosticCategory =
  | "missing_token"
  | "expired_or_reused_token"
  | "wrong_secret_sitekey_pairing"
  | "hostname_or_configuration_mismatch"
  | "generic_captcha_failed";

export function claimFreshTurnstileToken(
  state: Gate3TurnstileTokenState | null,
  nowMs: number,
): Gate3TurnstileTokenClaim {
  if (!state?.token) return { category: "missing_token", token: null, nextState: null };
  const ageMs = nowMs - state.issuedAtMs;
  if (state.claimed || !Number.isFinite(ageMs) || ageMs < 0 || ageMs >= TURNSTILE_TOKEN_MAX_AGE_MS) {
    return { category: "expired_or_reused_token", token: null, nextState: null };
  }
  return {
    category: "ready",
    token: state.token,
    nextState: { ...state, claimed: true },
  };
}

export function classifyGate3CaptchaFailure(evidence: {
  tokenState: "present" | "missing" | "expired_or_reused";
  deployedSitekeyMatchesWidget: boolean | null;
  supabaseSecretMatchesWidget: boolean | null;
  hostnameMatchesWidget: boolean | null;
  supabaseErrorCode: string | null;
}): Gate3CaptchaDiagnosticCategory | null {
  if (evidence.tokenState === "missing") return "missing_token";
  if (evidence.tokenState === "expired_or_reused") return "expired_or_reused_token";
  if (evidence.deployedSitekeyMatchesWidget === false || evidence.supabaseSecretMatchesWidget === false) {
    return "wrong_secret_sitekey_pairing";
  }
  if (evidence.hostnameMatchesWidget === false) return "hostname_or_configuration_mismatch";
  return evidence.supabaseErrorCode === "captcha_failed" ? "generic_captcha_failed" : null;
}
