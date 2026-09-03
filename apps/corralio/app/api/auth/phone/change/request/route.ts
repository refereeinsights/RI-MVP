import { NextResponse } from "next/server";

import { readPhoneAuthConfiguration } from "@/lib/phoneAuth";
import { requestPhoneChange } from "@/lib/phoneAuth.server";
import { createSmsDurableSafetyGateway } from "@/lib/sms/durableSafety.server";
import { getCorralioSiteOrigin } from "@/lib/siteOrigin.server";
import { createCorralioSupabaseAdminClient, createCorralioSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!readPhoneAuthConfiguration(process.env).enabled) return NextResponse.json({ status: "unavailable" }, { status: 404 });
  let phone: unknown;
  try { phone = (JSON.parse(await request.text()) as { phone?: unknown }).phone; } catch { phone = null; }
  if (typeof phone !== "string") return NextResponse.json({ status: "denied" }, { status: 400 });
  const result = await requestPhoneChange({
    request, phone, expectedOrigin: getCorralioSiteOrigin(),
    hmacSecret: process.env.CORRALIO_SMS_CHANNEL_HMAC_SECRET,
    safety: createSmsDurableSafetyGateway(createCorralioSupabaseAdminClient()),
    authenticated: createCorralioSupabaseServerClient(),
  });
  return NextResponse.json(result, { status: result.status === "pending" ? 202 : 400 });
}
