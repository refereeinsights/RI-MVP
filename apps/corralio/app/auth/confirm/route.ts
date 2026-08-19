import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";

import { createCorralioAuthResultRedirect } from "@/lib/authResultRedirect";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (!code && !(tokenHash && (type === "email" || type === "magiclink"))) {
    return createCorralioAuthResultRedirect("/?auth=invalid");
  }

  const response = createCorralioAuthResultRedirect("/");
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
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type as "email" | "magiclink" });
  return error ? createCorralioAuthResultRedirect("/?auth=expired") : response;
}
