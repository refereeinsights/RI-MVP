import crypto from "crypto";

export type UnsubscribeScope = "marketing" | "all";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function stablePayload(params: { email: string; scope: UnsubscribeScope; exp: number }) {
  return `${normalizeEmail(params.email)}|${params.scope}|${params.exp}`;
}

export function signUnsubscribeToken(params: {
  email: string;
  scope: UnsubscribeScope;
  exp: number; // unix seconds
  secret: string;
}) {
  const payload = stablePayload(params);
  const sig = crypto.createHmac("sha256", params.secret).update(payload).digest("base64url");
  return { sig, payload };
}

export function verifyUnsubscribeToken(params: {
  email: string;
  scope: UnsubscribeScope;
  exp: number;
  sig: string;
  secret: string;
  now?: number; // unix seconds
}) {
  const now = params.now ?? Math.floor(Date.now() / 1000);
  if (!params.sig) return false;
  if (!Number.isFinite(params.exp) || params.exp <= 0) return false;
  if (params.exp < now) return false;
  const expected = signUnsubscribeToken({
    email: params.email,
    scope: params.scope,
    exp: params.exp,
    secret: params.secret,
  }).sig;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(params.sig));
  } catch {
    return false;
  }
}

