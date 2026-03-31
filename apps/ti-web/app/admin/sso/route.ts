import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sanitizeReturnTo } from "@/lib/returnTo";
import { verifyTiAdminSsoToken } from "@/lib/tiSso";
import type { Database } from "@/lib/types/supabase";

export const runtime = "nodejs";

function getConfiguredAdminEmails() {
  const raw = process.env.TI_ADMIN_EMAILS || process.env.RI_ADMIN_EMAIL || "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedAdminEmail(email: string) {
  const adminEmails = getConfiguredAdminEmails();
  const isDevelopment = process.env.NODE_ENV !== "production";
  return adminEmails.length > 0 ? adminEmails.includes(email) : isDevelopment;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || "").trim();
  if (!token) {
    return NextResponse.redirect(new URL("/login?notice=sso_missing_token", req.url), 303);
  }

  const verified = verifyTiAdminSsoToken(token);
  if (!verified.ok) {
    const params = new URLSearchParams();
    params.set("returnTo", "/account");
    params.set("notice", `sso_${verified.error}`);
    return NextResponse.redirect(new URL(`/login?${params.toString()}`, req.url), 303);
  }

  const email = verified.payload.email.trim().toLowerCase();
  if (!isAllowedAdminEmail(email)) {
    return NextResponse.redirect(new URL("/?notice=sso_not_authorized", req.url), 303);
  }

  const returnTo = sanitizeReturnTo(verified.payload.returnTo, "/account");
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${url.origin}/auth/confirm?next=${encodeURIComponent(returnTo)}` },
  });

  const tokenHash = (data as any)?.properties?.hashed_token ? String((data as any).properties.hashed_token) : "";
  if (error || !tokenHash) {
    const params = new URLSearchParams();
    params.set("returnTo", returnTo);
    params.set("notice", "sso_magiclink_failed");
    return NextResponse.redirect(new URL(`/login?${params.toString()}`, req.url), 303);
  }

  // Verify OTP server-side so we don't bounce through Supabase's action_link (which can
  // fall back to the project's Site URL and leak tokens into URL fragments).
  const successRedirect = NextResponse.redirect(new URL(returnTo, req.url), 303);
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            successRedirect.cookies.set(name, value, { ...options, path: "/" });
          });
        },
      },
    }
  );

  const { error: verifyErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });

  if (verifyErr) {
    const params = new URLSearchParams();
    params.set("returnTo", returnTo);
    params.set("notice", `sso_verify_${verifyErr.name || "failed"}`);
    return NextResponse.redirect(new URL(`/login?${params.toString()}`, req.url), 303);
  }

  return successRedirect;
}
