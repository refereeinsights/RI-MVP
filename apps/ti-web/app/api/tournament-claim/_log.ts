import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeEmail } from "@/lib/tournamentClaim";

function firstIpFromHeader(value: string | null) {
  if (!value) return null;
  // x-forwarded-for: "client, proxy1, proxy2"
  const first = value.split(",")[0]?.trim();
  return first || null;
}

export function hashIp(ip: string | null, salt: string | null) {
  if (!ip) return null;
  const input = salt ? `${salt}:${ip}` : ip;
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function logTournamentClaimEvent(input: {
  tournamentId: string | null;
  eventType: string;
  enteredEmail?: string | null;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
}) {
  const enteredEmail = input.enteredEmail ? normalizeEmail(input.enteredEmail) : null;
  const salt = process.env.TOURNAMENT_CLAIM_IP_SALT ?? null;
  const ipHash = hashIp(input.ip ?? null, salt);

  // Best-effort logging; don't block the UX on analytics failures.
  try {
    await (supabaseAdmin.from("tournament_claim_events" as any) as any).insert({
      tournament_id: input.tournamentId,
      event_type: input.eventType,
      entered_email: enteredEmail,
      user_id: input.userId ?? null,
      ip_hash: ipHash,
      user_agent: input.userAgent ?? null,
      meta: input.meta ?? {},
    });
  } catch {
    // ignore
  }
}

export function getRequestContext(req: Request) {
  const ip = firstIpFromHeader(req.headers.get("x-forwarded-for")) ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;
  return { ip, userAgent };
}

