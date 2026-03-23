import crypto from "node:crypto";

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sanitizeReturnTo(value: string, fallback = "/") {
  const raw = (value ?? "").trim();
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  return raw;
}

function base64UrlEncode(input: string) {
  // Node supports 'base64url' in modern versions, but keep it compatible.
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function buildTiAdminSsoUrl(params: { tiAdminBaseUrl: string; email: string; returnTo: string }) {
  const secret = process.env.TI_SSO_SECRET || "";
  const ttlSecondsRaw = process.env.TI_SSO_TTL_SECONDS || "";
  const ttlSeconds = Number.parseInt(ttlSecondsRaw, 10);
  const effectiveTtlSeconds = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 600;
  const tiBase = params.tiAdminBaseUrl.replace(/\/$/, "");
  const email = params.email.trim().toLowerCase();
  const returnTo = sanitizeReturnTo(params.returnTo, "/");

  if (!hasText(secret) || !hasText(email)) {
    // Fall back to direct URL if SSO isn't configured.
    return `${tiBase}${returnTo}`;
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    email,
    returnTo,
    iat: now,
    exp: now + effectiveTtlSeconds,
    nonce: crypto.randomBytes(12).toString("hex"),
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const sigB64 = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  const token = `${payloadB64}.${sigB64}`;

  return `${tiBase}/admin/sso?token=${encodeURIComponent(token)}`;
}
