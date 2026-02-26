import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/supabase";

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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash");
  const typeParam = url.searchParams.get("type");
  const nextParam = url.searchParams.get("next");

  if (!tokenHash || !isOtpType(typeParam)) {
    return NextResponse.redirect(new URL("/auth/error?notice=auth_link_invalid", req.url), 303);
  }

  const defaultNext = typeParam === "recovery" ? "/account/reset-password" : "/account";
  const nextPath = sanitizeNext(nextParam, defaultNext);

  const successRedirect = NextResponse.redirect(new URL(nextPath, req.url), 303);
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
            successRedirect.cookies.set(name, value, options);
          });
        },
      },
    }
  );

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

  return successRedirect;
}

