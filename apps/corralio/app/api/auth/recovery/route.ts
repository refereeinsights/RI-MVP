import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { buildCorralioRecoveryRedirect } from "@/lib/siteOrigin";
import { getCorralioSiteOrigin } from "@/lib/siteOrigin.server";

const GENERIC_RESPONSE = { ok: true, message: "If an account exists for that email, we’ve sent password-reset instructions." };

export async function POST(request: Request) {
  let email = "";
  try {
    const body = await request.json() as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim() : "";
  } catch {
    return NextResponse.json(GENERIC_RESPONSE);
  }

  if (!email) return NextResponse.json(GENERIC_RESPONSE);

  let redirectTo: string;
  try {
    redirectTo = buildCorralioRecoveryRedirect(getCorralioSiteOrigin());
  } catch {
    console.error("[corralio-auth] Password recovery is unavailable because CORRALIO_SITE_URL is missing or invalid.");
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error("[corralio-auth] Password recovery is unavailable because Supabase public configuration is missing.");
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  try {
    const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  } catch {
    // Preserve the same response for unknown accounts, rate limits, and provider failures.
  }

  return NextResponse.json(GENERIC_RESPONSE);
}
