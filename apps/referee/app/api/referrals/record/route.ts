import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Server misconfigured." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const referralCode = String(body?.referral_code ?? "").trim();
  const referredUserId = String(body?.referred_user_id ?? "").trim();

  if (!referralCode || !referredUserId) {
    return NextResponse.json({ ok: false, error: "Missing payload." }, { status: 400 });
  }

  const supabaseService = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: codeRow, error: codeError } = await supabaseService
    .from("referral_codes" as any)
    .select("user_id")
    .eq("code", referralCode)
    .maybeSingle();

  if (codeError || !codeRow) {
    return NextResponse.json({ ok: false, error: "Invalid referral code." }, { status: 400 });
  }

  const referrerId = (codeRow as any).user_id as string;
  if (!referrerId || referrerId === referredUserId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { error } = await supabaseService.from("referrals" as any).insert({
    referrer_id: referrerId,
    referred_user_id: referredUserId,
    referral_code: referralCode,
    status: "signed_up",
  });

  if (error) {
    if (String(error.message || "").toLowerCase().includes("duplicate")) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    return NextResponse.json({ ok: false, error: "Unable to record referral." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
