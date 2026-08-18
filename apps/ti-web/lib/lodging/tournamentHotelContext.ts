import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 1;
const DEFAULT_TTL_SECONDS = 6 * 60 * 60;
const MAX_TTL_SECONDS = 24 * 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TournamentHotelContextPayload = {
  v: 1;
  tid: string;
  iat: number;
  exp: number;
};

type TokenOptions = {
  secret?: string | null;
  nowSeconds?: number;
  ttlSeconds?: number;
};

function contextSecret(override?: string | null) {
  return String(
    override ??
      process.env.TI_HOTEL_CONTEXT_SECRET ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      ""
  ).trim();
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`ti-hotel-tournament-context-v1:${payload}`, "utf8")
    .digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes as unknown as Uint8Array, rightBytes as unknown as Uint8Array)
  );
}

export function issueTournamentHotelContext(
  tournamentId: string,
  options: TokenOptions = {}
): string | null {
  const trustedTournamentId = String(tournamentId ?? "").trim();
  const secret = contextSecret(options.secret);
  if (!secret || !UUID_RE.test(trustedTournamentId)) return null;

  const now = Math.floor(options.nowSeconds ?? Date.now() / 1000);
  const requestedTtl = Math.floor(options.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const ttl = Math.min(Math.max(requestedTtl, 60), MAX_TTL_SECONDS);
  const payload: TournamentHotelContextPayload = {
    v: TOKEN_VERSION,
    tid: trustedTournamentId,
    iat: now,
    exp: now + ttl,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload, secret)}`;
}

export type TournamentHotelContextVerification =
  | { ok: true; tournamentId: string }
  | { ok: false; reason: "missing" | "format" | "signature" | "payload" | "expired" | "mismatch" | "not_configured" };

export function verifyTournamentHotelContext(
  token: string | null | undefined,
  expectedTournamentId: string | null | undefined,
  options: TokenOptions = {}
): TournamentHotelContextVerification {
  const rawToken = String(token ?? "").trim();
  const expectedId = String(expectedTournamentId ?? "").trim();
  if (!rawToken) return { ok: false, reason: "missing" };
  if (!UUID_RE.test(expectedId) || rawToken.length > 1024) return { ok: false, reason: "format" };

  const secret = contextSecret(options.secret);
  if (!secret) return { ok: false, reason: "not_configured" };
  const parts = rawToken.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "format" };
  const [encodedPayload, providedSignature] = parts;
  if (!safeEqual(signature(encodedPayload, secret), providedSignature)) {
    return { ok: false, reason: "signature" };
  }

  let payload: TournamentHotelContextPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as TournamentHotelContextPayload;
  } catch {
    return { ok: false, reason: "payload" };
  }

  if (
    payload?.v !== TOKEN_VERSION ||
    !UUID_RE.test(String(payload?.tid ?? "")) ||
    !Number.isSafeInteger(payload?.iat) ||
    !Number.isSafeInteger(payload?.exp) ||
    payload.exp <= payload.iat ||
    payload.exp - payload.iat > MAX_TTL_SECONDS
  ) {
    return { ok: false, reason: "payload" };
  }
  if (payload.tid !== expectedId) return { ok: false, reason: "mismatch" };

  const now = Math.floor(options.nowSeconds ?? Date.now() / 1000);
  if (payload.iat > now + 60 || payload.exp < now) return { ok: false, reason: "expired" };
  return { ok: true, tournamentId: payload.tid };
}
