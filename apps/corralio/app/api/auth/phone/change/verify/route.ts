import { NextResponse } from "next/server";

import { readPhoneAuthConfiguration } from "@/lib/phoneAuth";
import { verifyPhoneChangeOtp } from "@/lib/phoneAuth.server";
import { getCorralioSiteOrigin } from "@/lib/siteOrigin.server";
import { createCorralioSupabaseAdminClient, createCorralioSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!readPhoneAuthConfiguration(process.env).enabled) return NextResponse.json({ status: "unavailable" }, { status: 404 });
  let input: { phone?: unknown; token?: unknown } = {};
  try { input = JSON.parse(await request.text()) as typeof input; } catch { /* bounded denial below */ }
  if (typeof input.phone !== "string") return NextResponse.json({ status: "denied" }, { status: 400 });
  const result = await verifyPhoneChangeOtp({
    request, phone: input.phone, token: input.token, expectedOrigin: getCorralioSiteOrigin(),
    authenticated: createCorralioSupabaseServerClient(), admin: createCorralioSupabaseAdminClient(),
    hmacSecret: process.env.CORRALIO_SMS_CHANNEL_HMAC_SECRET,
  });
  return NextResponse.json(result, { status: result.status === "verified" ? 200 : 400 });
}
