import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (!code && !(tokenHash && (type === "email" || type === "magiclink"))) {
    return NextResponse.redirect(new URL("/?auth=invalid", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/", request.url), 303);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.redirect(new URL("/?auth=unavailable", request.url), 303);

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
  return error ? NextResponse.redirect(new URL("/?auth=expired", request.url), 303) : response;
}
