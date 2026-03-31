import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function buildAccountPath(kind: "notice" | "error", message: string) {
  const params = new URLSearchParams();
  params.set(kind, message);
  return `/account?${params.toString()}`;
}

function redirectToAccount(req: NextRequest, kind: "notice" | "error", message: string) {
  return NextResponse.redirect(new URL(buildAccountPath(kind, message), req.url));
}

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
            response.cookies.set(name, value, { ...options, path: "/" });
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

  const email = (user.email ?? "").trim().toLowerCase();
  if (!email) {
    return redirectToAccount(req, "error", "Missing account email.");
  }

  const formData = await req.formData();
  const suppressMarketing = String(formData.get("suppress_marketing") ?? "").trim() === "on";
  const suppressAll = String(formData.get("suppress_all") ?? "").trim() === "on";

  const nextSuppressMarketing = suppressAll ? true : suppressMarketing;

  try {
    if (!nextSuppressMarketing && !suppressAll) {
      await (supabaseAdmin.from("email_suppressions" as any) as any).delete().eq("email", email);
      return redirectToAccount(req, "notice", "Email preferences updated.");
    }

    const { error } = await (supabaseAdmin.from("email_suppressions" as any) as any).upsert(
      {
        email,
        suppress_marketing: nextSuppressMarketing,
        suppress_all: suppressAll,
        reason: "user_preference",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" }
    );

    if (error) {
      return redirectToAccount(req, "error", `Unable to update email preferences: ${error.message}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to update email preferences.";
    return redirectToAccount(req, "error", message);
  }

  return redirectToAccount(req, "notice", "Email preferences updated.");
}

