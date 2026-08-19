import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";

import { resolveCorralioAuthCallback } from "@/lib/authCallback";
import { createCorralioAuthResultRedirect } from "@/lib/authResultRedirect";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const callback = resolveCorralioAuthCallback({
    code,
    tokenHash,
    type,
    flow: request.nextUrl.searchParams.get("flow"),
  });
  if (!callback.valid) {
    return createCorralioAuthResultRedirect("/?auth=invalid");
  }

  const successPath = callback.recovery ? "/account/reset-password" : "/";
  const failurePath = callback.recovery ? "/account/reset-password?auth=expired" : "/?auth=expired";
  const response = createCorralioAuthResultRedirect(successPath);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return createCorralioAuthResultRedirect("/?auth=unavailable");

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, { ...options, path: "/" });
        });
      },
    },
  });
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: callback.otpType! });
  return error ? createCorralioAuthResultRedirect(failurePath) : response;
}
