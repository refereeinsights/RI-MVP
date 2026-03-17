import { NextResponse } from "next/server";
import { logTournamentClaimEvent, getRequestContext } from "../_log";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const tournamentId = typeof body?.tournamentId === "string" ? body.tournamentId : null;

  const { ip, userAgent } = getRequestContext(req);
  await logTournamentClaimEvent({
    tournamentId,
    eventType: "Tournament Claim Clicked",
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true });
}

