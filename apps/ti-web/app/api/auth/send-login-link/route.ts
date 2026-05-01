import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizeReturnTo } from "@/lib/returnTo";

export const runtime = "nodejs";

function safeOrigin() {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_ORIGIN || "").trim().replace(/\/+$/, "");
  return raw || "https://www.tournamentinsights.com";
}

function safeEmail(value: unknown) {
  const email = String(value ?? "").trim();
  if (!email || !email.includes("@")) return null;
  if (email.length > 320) return null;
  return email;
}

export async function POST(req: Request) {
  // Always return a neutral OK response (avoid leaking whether an email exists).
  try {
    const body = await req.json().catch(() => ({}));
    const email = safeEmail((body as any)?.email);
    const returnToRaw = typeof (body as any)?.returnTo === "string" ? (body as any).returnTo : null;
    const returnTo = sanitizeReturnTo(returnToRaw, "/premium");

    if (!email) return NextResponse.json({ ok: true });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return NextResponse.json({ ok: true });

    const origin = safeOrigin();
    const redirectUrl = new URL("/auth/confirm", origin);
    redirectUrl.searchParams.set("next", returnTo);

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { error } = await authClient.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl.toString(),
        // Do not create a new user via magic-link flow; this is meant to continue in the same browser.
        shouldCreateUser: false,
      } as any,
    });

    if (error) {
      console.warn("[auth][send-login-link] failed", { message: error.message });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn("[auth][send-login-link] exception", {
      message: err instanceof Error ? err.message : String(err ?? ""),
    });
    return NextResponse.json({ ok: true });
  }
}

