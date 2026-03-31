import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/supabase";

function buildAccountPath(kind: "notice" | "error", message: string) {
  const params = new URLSearchParams();
  params.set(kind, message);
  return `/account?${params.toString()}`;
}

function redirectToAccount(req: NextRequest, kind: "notice" | "error", message: string) {
  return NextResponse.redirect(new URL(buildAccountPath(kind, message), req.url));
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isPlausibleEmail(value: string) {
  // Basic sanity check (Supabase will enforce more rules server-side).
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
  if (!user.email_confirmed_at) {
    return redirectToAccount(req, "error", "Verify your email before changing it.");
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
    return NextResponse.json({ ok: false, error: "Unsupported content type." }, { status: 400 });
  }

  const formData = await req.formData();
  const nextEmail = normalizeEmail(formData.get("new_email"));
  if (!nextEmail) return redirectToAccount(req, "error", "New email is required.");
  if (!isPlausibleEmail(nextEmail)) return redirectToAccount(req, "error", "Enter a valid email address.");
  if ((user.email ?? "").trim().toLowerCase() === nextEmail) {
    return redirectToAccount(req, "notice", "That’s already your current email.");
  }

  const { error } = await supabase.auth.updateUser({ email: nextEmail });
  if (error) {
    return redirectToAccount(req, "error", `Email update failed: ${error.message}`);
  }

  return redirectToAccount(
    req,
    "notice",
    `Confirmation sent to ${nextEmail}. Click the link in that email to finish updating your sign-in.`
  );
}

