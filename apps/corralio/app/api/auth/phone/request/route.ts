import { NextResponse } from "next/server";

import { readPhoneAuthConfiguration } from "@/lib/phoneAuth";
import { requestPhoneOtp } from "@/lib/phoneAuth.server";
import { createSmsDurableSafetyGateway } from "@/lib/sms/durableSafety.server";
import { getCorralioSiteOrigin } from "@/lib/siteOrigin.server";
import { createCorralioSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: Request) {
  if (!readPhoneAuthConfiguration(process.env).enabled) {
    return NextResponse.json({ status: "unavailable" }, { status: 404, headers: NO_STORE });
  }
  let input: { phone?: unknown; captchaToken?: unknown };
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 8192) throw new Error("oversized");
    input = JSON.parse(raw) as typeof input;
  } catch {
    return NextResponse.json({ status: "denied" }, { status: 400, headers: NO_STORE });
  }
  if (typeof input.phone !== "string" || typeof input.captchaToken !== "string") {
    return NextResponse.json({ status: "denied" }, { status: 400, headers: NO_STORE });
  }
  const result = await requestPhoneOtp({
    request,
    phone: input.phone,
    captchaToken: input.captchaToken,
    expectedOrigin: getCorralioSiteOrigin(),
    hmacSecret: process.env.CORRALIO_SMS_CHANNEL_HMAC_SECRET,
    safety: createSmsDurableSafetyGateway(createCorralioSupabaseAdminClient()),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  });
  return NextResponse.json(result, {
    status: result.status === "pending" ? 202 : 400,
    headers: NO_STORE,
  });
}
