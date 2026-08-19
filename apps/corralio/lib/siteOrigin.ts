export function parseCorralioSiteOrigin(rawValue: string | undefined): string {
  const raw = rawValue?.trim();
  if (!raw) throw new Error("Missing CORRALIO_SITE_URL");

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid CORRALIO_SITE_URL");
  }

  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new Error("CORRALIO_SITE_URL must be an HTTP(S) origin");
  }

  return parsed.origin;
}

export function buildCorralioRecoveryRedirect(origin: string): string {
  const redirect = new URL("/auth/confirm", parseCorralioSiteOrigin(origin));
  redirect.searchParams.set("brand", "corralio");
  // The marker lets a PKCE code callback select the fixed recovery destination.
  // It is presentation/flow context only and grants no authorization.
  redirect.searchParams.set("flow", "recovery");
  return redirect.toString();
}
