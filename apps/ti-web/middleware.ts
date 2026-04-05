import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (pathname === "/auth/confirm" || pathname === "/auth/error") {
    return NextResponse.next();
  }

  let res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        encode: "tokens-only",
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          const secure = req.nextUrl.protocol === "https:";
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, {
              ...options,
              path: "/",
              secure,
              sameSite: options?.sameSite ?? "lax",
            });
          });
        },
      },
    }
  );

  try {
    await supabase.auth.getUser();
  } catch (err: any) {
    // If the session cookies are in a broken state (e.g. access token cookie present but refresh token missing),
    // auth-js will throw. Clear the session cookies so the request can continue as anonymous.
    const code = err?.code ?? null;
    const message = String(err?.message ?? "");
    if (code === "refresh_token_not_found" || message.includes("Refresh Token Not Found")) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
    }
  }

  return res;
}

export const config = {
  // Run Supabase cookie refresh/repair for all HTML pages (but not API routes or static assets).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
