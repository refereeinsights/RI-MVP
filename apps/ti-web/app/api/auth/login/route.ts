import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { USERNAME_PATTERN, normalizeUsername } from "@/lib/tiProfile";

export const runtime = "nodejs";

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

function isEmailLike(value: string) {
  const trimmed = value.trim();
  return trimmed.includes("@") && trimmed.includes(".");
}

async function resolveEmailFromIdentifier(identifier: string): Promise<string | null> {
  const raw = identifier.trim();
  if (!raw) return null;
  if (isEmailLike(raw)) return raw.toLowerCase();

  const username = normalizeUsername(raw);
  if (!USERNAME_PATTERN.test(username)) return null;

  const { data } = await (supabaseAdmin.from("ti_users" as any) as any)
    .select("email")
    .or(`username.eq.${username},reviewer_handle.eq.${username}`)
    .limit(1)
    .maybeSingle();

  const email = (typeof (data as any)?.email === "string" ? String((data as any).email) : "").trim().toLowerCase();
  return email ? email : null;
}

export async function POST(req: NextRequest) {
  const response = NextResponse.json({ ok: true });
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
            response.cookies.set(name, value, {
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

  const payload = (await req.json().catch(() => null)) as { identifier?: unknown; password?: unknown } | null;
  const identifier = typeof payload?.identifier === "string" ? payload.identifier.trim() : "";
  const password = typeof payload?.password === "string" ? payload.password : "";

  if (!identifier || !password) {
    return NextResponse.json({ ok: false, error: "Invalid login." }, { status: 400 });
  }

  let email: string | null = null;
  try {
    email = await resolveEmailFromIdentifier(identifier);
  } catch {
    // Fail closed with generic auth error to avoid leaking existence.
    email = null;
  }

  if (!email) {
    return NextResponse.json({ ok: false, error: "Invalid login." }, { status: 401 });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const lowered = `${(error as any)?.code ?? ""} ${(error as any)?.message ?? ""}`.toLowerCase();
    if (lowered.includes("email not confirmed") || lowered.includes("email_not_confirmed")) {
      return NextResponse.json({ ok: false, needs_verify: true, email }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "Invalid login." }, { status: 401 });
  }

  const user = data.user;
  if (!user?.email_confirmed_at) {
    return NextResponse.json({ ok: false, needs_verify: true, email }, { status: 401 });
  }

  return response;
}
