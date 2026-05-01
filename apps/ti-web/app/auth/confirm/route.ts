import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/supabase";
import { syncTiUserProfileFromAuthUser } from "@/lib/tiUserProfileServer";

type OtpType = "email" | "magiclink" | "recovery" | "email_change";

const ALLOWED_TYPES = new Set<OtpType>([
  "email",
  "magiclink",
  "recovery",
  "email_change",
]);

function isOtpType(value: string | null): value is OtpType {
  return Boolean(value && ALLOWED_TYPES.has(value as OtpType));
}

function sanitizeNext(value: string | null, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  return value;
}

function cookieDomainForHost(hostname: string) {
  const host = (hostname || "").trim().toLowerCase();
  if (!host) return undefined;
  if (host === "localhost") return undefined;
  if (host.endsWith(".vercel.app")) return undefined;
  if (host === "tournamentinsights.com" || host.endsWith(".tournamentinsights.com")) {
    return ".tournamentinsights.com";
  }
  return undefined;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const typeParam = url.searchParams.get("type");
  const nextParam = url.searchParams.get("next");

  const defaultNext =
    typeParam === "recovery" ? "/account/reset-password" : "/account";
  const nextPath = sanitizeNext(nextParam, defaultNext);

  const successRedirect = NextResponse.redirect(new URL(nextPath, req.url), 303);
  const secure = req.nextUrl.protocol === "https:";
  const cookieDomain = cookieDomainForHost(req.nextUrl.hostname);
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
            successRedirect.cookies.set(name, value, {
              ...options,
              path: "/",
              domain: cookieDomain,
              secure,
              sameSite: options?.sameSite ?? "lax",
            });
          });
        },
      },
    }
  );

  // Support both Supabase OTP links (token_hash+type) and code-based flows (code=...).
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const failureNotice =
        error.name === "AuthApiError" ? "auth_link_expired" : "auth_link_invalid";
      return NextResponse.redirect(
        new URL(`/auth/error?notice=${encodeURIComponent(failureNotice)}`, req.url),
        303
      );
    }
  } else {
    if (!tokenHash || !isOtpType(typeParam)) {
      return NextResponse.redirect(new URL("/auth/error?notice=auth_link_invalid", req.url), 303);
    }

    const { error } = await supabase.auth.verifyOtp({
      type: typeParam,
      token_hash: tokenHash,
    });

    if (error) {
      const failureNotice =
        error.name === "AuthApiError" ? "auth_link_expired" : "auth_link_invalid";
      return NextResponse.redirect(
        new URL(`/auth/error?notice=${encodeURIComponent(failureNotice)}`, req.url),
        303
      );
    }
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const result = await syncTiUserProfileFromAuthUser(user);
      if (!result.ok) {
        console.warn("[auth][confirm] profile sync failed", {
          user_id: user.id,
          error: result.error ?? null,
          usernameConflict: result.usernameConflict ?? null,
        });
      }
    }
  } catch (syncErr) {
    console.warn("[auth][confirm] profile sync exception", {
      message: syncErr instanceof Error ? syncErr.message : String(syncErr ?? ""),
    });
  }

  return successRedirect;
}
