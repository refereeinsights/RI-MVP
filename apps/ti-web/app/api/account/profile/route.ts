import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/supabase";
import { syncTiUserProfileFromAuthUser } from "@/lib/tiUserProfileServer";

export async function POST(req: NextRequest) {
  const response = NextResponse.json({ ok: true });
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
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const result = await syncTiUserProfileFromAuthUser(user);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "Unable to save profile.", usernameConflict: result.usernameConflict ?? false },
      { status: result.usernameConflict ? 409 : 500 }
    );
  }

  return NextResponse.json({ ok: true, warning: result.warning ?? null });
}
