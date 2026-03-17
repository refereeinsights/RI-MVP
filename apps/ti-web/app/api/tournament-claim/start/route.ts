import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canEditTournament, normalizeEmail } from "@/lib/tournamentClaim";
import { logTournamentClaimEvent, getRequestContext, hashIp } from "../_log";

export const runtime = "nodejs";

function getRedirectTo(slug: string) {
  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN || "https://www.tournamentinsights.com";
  // Route through /auth/confirm so Supabase can set the session cookie via verifyOtp,
  // then bounce back to the tournament page.
  const nextPath = `/tournaments/${slug}?claim=1`;
  const url = new URL("/auth/confirm", origin);
  url.searchParams.set("next", nextPath);
  return url.toString();
}

async function shouldRateLimit(params: {
  tournamentId: string;
  ip: string | null;
}) {
  if (!params.ip) return false;
  const salt = process.env.TOURNAMENT_CLAIM_IP_SALT ?? null;
  const ipHash = hashIp(params.ip, salt);
  if (!ipHash) return false;

  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  try {
    const { count } = await (supabaseAdmin.from("tournament_claim_events" as any) as any)
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", params.tournamentId)
      .eq("ip_hash", ipHash)
      .gte("created_at", cutoff);
    return (count ?? 0) >= 8;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const tournamentId = typeof body?.tournamentId === "string" ? body.tournamentId : "";
  const enteredEmail = typeof body?.email === "string" ? body.email : "";
  const honeypot = typeof body?.company === "string" ? body.company : "";

  const { ip, userAgent } = getRequestContext(req);

  // Bot trap.
  if (honeypot.trim()) {
    await logTournamentClaimEvent({
      tournamentId: tournamentId || null,
      eventType: "Tournament Claim Started",
      enteredEmail,
      ip,
      userAgent,
      meta: { bot: true },
    });
    return NextResponse.json({ ok: true });
  }

  await logTournamentClaimEvent({
    tournamentId: tournamentId || null,
    eventType: "Tournament Claim Started",
    enteredEmail,
    ip,
    userAgent,
  });

  if (!tournamentId || !normalizeEmail(enteredEmail)) {
    // Neutral response to avoid leaking anything.
    return NextResponse.json({ ok: true });
  }

  if (await shouldRateLimit({ tournamentId, ip })) {
    await logTournamentClaimEvent({
      tournamentId,
      eventType: "Tournament Claim Failed Rate Limited",
      enteredEmail,
      ip,
      userAgent,
    });
    return NextResponse.json({ ok: true });
  }

  const { data: tRowRaw } = await (supabaseAdmin.from("tournaments" as any) as any)
    .select("id,slug,tournament_director_email")
    .eq("id", tournamentId)
    .maybeSingle();

  const tRow = (tRowRaw ?? null) as { id: string; slug: string | null; tournament_director_email: string | null } | null;
  const directorEmailOnFile = tRow?.tournament_director_email ?? null;
  const slug = tRow?.slug ?? null;
  const matches = canEditTournament(enteredEmail, directorEmailOnFile);

  if (!directorEmailOnFile) {
    await logTournamentClaimEvent({
      tournamentId,
      eventType: "Tournament Claim Failed Missing Director Email",
      enteredEmail,
      ip,
      userAgent,
    });
    return NextResponse.json({ ok: true });
  }

  if (!matches) {
    // Do not reveal mismatch in the UI response.
    await logTournamentClaimEvent({
      tournamentId,
      eventType: "Tournament Claim Failed Email Mismatch",
      enteredEmail,
      ip,
      userAgent,
    });
    return NextResponse.json({ ok: true });
  }

  if (!slug) {
    await logTournamentClaimEvent({
      tournamentId,
      eventType: "Tournament Claim Failed Missing Slug",
      enteredEmail,
      ip,
      userAgent,
    });
    return NextResponse.json({ ok: true });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    await logTournamentClaimEvent({
      tournamentId,
      eventType: "Tournament Claim Failed Missing Supabase Public Env",
      enteredEmail,
      ip,
      userAgent,
    });
    return NextResponse.json({ ok: true });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const redirectTo = getRedirectTo(slug);
  const { error } = await authClient.auth.signInWithOtp({
    email: normalizeEmail(enteredEmail),
    options: { emailRedirectTo: redirectTo },
  });

  if (error) {
    await logTournamentClaimEvent({
      tournamentId,
      eventType: "Tournament Claim Failed Magic Link Error",
      enteredEmail,
      ip,
      userAgent,
      meta: { message: error.message },
    });
    return NextResponse.json({ ok: true });
  }

  await logTournamentClaimEvent({
    tournamentId,
    eventType: "Tournament Claim Magic Link Sent",
    enteredEmail,
    ip,
    userAgent,
    meta: { redirectTo },
  });

  return NextResponse.json({ ok: true });
}
