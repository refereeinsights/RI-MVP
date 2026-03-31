import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/supabase";
import { sanitizeReturnTo } from "@/lib/returnTo";

export async function GET(req: NextRequest) {
  const returnTo = sanitizeReturnTo(req.nextUrl.searchParams.get("returnTo"), "/");
  const res = NextResponse.redirect(new URL(returnTo, req.url));
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
            res.cookies.set(name, value, { ...options, path: "/" });
          });
        },
      },
    }
  );

  await supabase.auth.signOut();
  return res;
}
