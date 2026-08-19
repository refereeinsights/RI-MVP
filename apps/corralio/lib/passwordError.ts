type AuthErrorLike = { code?: string; message?: string; status?: number } | null | undefined;

export function getCorralioPasswordUpdateError(error: AuthErrorLike): string {
  const value = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (
    value.includes("reauth")
    || value.includes("session_not_found")
    || value.includes("session missing")
    || value.includes("jwt expired")
  ) {
    return "Your session is no longer recent enough to change your password. Sign out, then sign in again with an email link and retry.";
  }
  if (value.includes("weak_password") || value.includes("password should") || value.includes("password must")) {
    return "Choose a stronger password that meets the account password requirements.";
  }
  return "We couldn’t update your password. Please try again.";
}
