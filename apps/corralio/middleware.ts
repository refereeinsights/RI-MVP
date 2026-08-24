import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  CORRALIO_ACQUISITION_COOKIE,
  CORRALIO_ACQUISITION_COOKIE_MAX_AGE,
  TI_WEEKEND_PLANNER_PROVENANCE,
} from "./lib/acquisition";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next();
  if (request.nextUrl.searchParams.get("src") === TI_WEEKEND_PLANNER_PROVENANCE) {
    response.cookies.set(CORRALIO_ACQUISITION_COOKIE, TI_WEEKEND_PLANNER_PROVENANCE, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: CORRALIO_ACQUISITION_COOKIE_MAX_AGE,
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      encode: "tokens-only",
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, { ...options, path: "/" });
        });
      },
    },
  });
  try {
    await supabase.auth.getUser();
  } catch {
    // A transient auth failure must not crash the public sign-in shell.
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
