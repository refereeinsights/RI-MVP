import { NextResponse } from "next/server";
import { logTournamentClaimEvent, getRequestContext } from "../_log";

export const runtime = "nodejs";

function safeUrl(value: string): string {
  if (!value) return "";
  try {
    const raw = value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString().slice(0, 500);
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const tournamentId = typeof body?.tournamentId === "string" ? body.tournamentId : null;
  const enteredEmail = typeof body?.email === "string" ? body.email : "";
  const honeypot = typeof body?.company === "string" ? body.company : "";

  // Structured claimant fields.
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  const role = typeof body?.role === "string" ? body.role.trim().slice(0, 60) : "";
  const organization = typeof body?.organization === "string" ? body.organization.trim().slice(0, 200) : "";
  const website = safeUrl(typeof body?.website === "string" ? body.website.trim() : "");
  const phone = typeof body?.phone === "string" ? body.phone.trim().slice(0, 30) : "";
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : "";

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

  await logTournamentClaimEvent({
    tournamentId,
    eventType: "Tournament Claim Request Review",
    enteredEmail,
    ip,
    userAgent,
    meta: {
      ...(name && { name }),
      ...(role && { role }),
      ...(organization && { organization }),
      ...(website && { website }),
      ...(phone && { phone }),
      ...(note && { note }),
      has_website: Boolean(website),
      has_organization: Boolean(organization),
    },
  });

  return NextResponse.json({ ok: true });
}
