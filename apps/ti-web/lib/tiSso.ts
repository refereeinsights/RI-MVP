import crypto from "node:crypto";

export type TiSsoPayloadV1 = {
  v: 1;
  email: string;
  returnTo: string;
  iat: number;
  exp: number;
  nonce: string;
};

function base64UrlDecodeToString(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function safeEqual(a: Buffer, b: Buffer) {
  if (a.length !== b.length) return false;
  // `timingSafeEqual` expects ArrayBufferView; Buffer satisfies at runtime, but
  // the TS lib types can be stricter depending on config.
  return crypto.timingSafeEqual(a as unknown as Uint8Array, b as unknown as Uint8Array);
}

export function verifyTiAdminSsoToken(token: string): { ok: true; payload: TiSsoPayloadV1 } | { ok: false; error: string } {
  const secret = process.env.TI_SSO_SECRET || "";
  if (!secret) return { ok: false, error: "sso_not_configured" };

  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, error: "token_format" };

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return { ok: false, error: "token_format" };

  const expected = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  const okSig = safeEqual(Buffer.from(expected), Buffer.from(sigB64));
  if (!okSig) return { ok: false, error: "token_signature" };

  let payload: TiSsoPayloadV1;
  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch {
    return { ok: false, error: "token_payload" };
  }

  if (payload?.v !== 1) return { ok: false, error: "token_version" };
  if (!payload?.email || typeof payload.email !== "string") return { ok: false, error: "token_email" };
  if (!payload?.returnTo || typeof payload.returnTo !== "string") return { ok: false, error: "token_returnTo" };
  if (typeof payload.exp !== "number" || typeof payload.iat !== "number") return { ok: false, error: "token_time" };

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now - 5) return { ok: false, error: "token_expired" };
  if (payload.iat > now + 60) return { ok: false, error: "token_future" };

  return { ok: true, payload };
}
