import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/supabase";
import { sanitizeReturnTo } from "@/lib/returnTo";

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
  const returnTo = sanitizeReturnTo(req.nextUrl.searchParams.get("returnTo"), "/");
  const res = NextResponse.redirect(new URL(returnTo, req.url));
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
            res.cookies.set(name, value, {
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

  await supabase.auth.signOut();
  return res;
}
