import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// Generate a short, stable-ish code from the user id
function shorten(userId: string) {
  return Buffer.from(userId.replace(/-/g, ""), "hex").toString("base64url").slice(0, 10);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${url.protocol}//${url.host}`;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured for referrals." },
      { status: 500 }
    );
  }

  // Read the authenticated user (if any)
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // server route; no cookie writes
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser();

  if (error || !user) {
    return NextResponse.redirect(`/account/login?redirect=/referrals`);
  }

  // Service role for writing the referral code
  const supabaseService = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Return existing code if present
  const { data: existing } = await supabaseService
    .from("referral_codes" as any)
    .select("code")
    .eq("user_id", user.id)
    .maybeSingle();

  let code = existing?.code as string | undefined;
  if (!code) {
    code = shorten(user.id);
    await supabaseService
      .from("referral_codes" as any)
      .upsert({ user_id: user.id, code, updated_at: new Date().toISOString() });
  }

  const { count } = await supabaseService
    .from("referrals" as any)
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", user.id);

  return NextResponse.json({
    ok: true,
    code,
    link: `${origin}/signup?ref=${code}`,
    count: count ?? 0,
  });
}
