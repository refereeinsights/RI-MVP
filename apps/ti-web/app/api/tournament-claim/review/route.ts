import { NextResponse } from "next/server";
import { logTournamentClaimEvent, getRequestContext } from "../_log";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const tournamentId = typeof body?.tournamentId === "string" ? body.tournamentId : null;
  const enteredEmail = typeof body?.email === "string" ? body.email : "";
  const message = typeof body?.message === "string" ? body.message : "";
  const honeypot = typeof body?.company === "string" ? body.company : "";

  const { ip, userAgent } = getRequestContext(req);

  // Bot trap.
  if (honeypot.trim()) {
    await logTournamentClaimEvent({
      tournamentId,
      eventType: "Tournament Claim Request Review",
      enteredEmail,
      ip,
      userAgent,
      meta: { bot: true },
    });
    return NextResponse.json({ ok: true });
  }

  // We don't create a separate requests table in v1; events are the audit trail.
  await logTournamentClaimEvent({
    tournamentId,
    eventType: "Tournament Claim Request Review",
    enteredEmail,
    ip,
    userAgent,
    meta: { message: message.slice(0, 2000) },
  });

  return NextResponse.json({ ok: true });
}
