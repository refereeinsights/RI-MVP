import { NextResponse } from "next/server";

import { readPhoneAuthConfiguration } from "@/lib/phoneAuth";
import { verifyPhoneOtp } from "@/lib/phoneAuth.server";
import { getCorralioSiteOrigin } from "@/lib/siteOrigin.server";
import {
  createCorralioSupabaseAdminClient,
  createCorralioSupabaseServerClient,
} from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: Request) {
  if (!readPhoneAuthConfiguration(process.env).enabled) {
    return NextResponse.json({ status: "unavailable" }, { status: 404, headers: NO_STORE });
  }
  let input: { phone?: unknown; token?: unknown };
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 4096) throw new Error("oversized");
    input = JSON.parse(raw) as typeof input;
  } catch {
    return NextResponse.json({ status: "denied" }, { status: 400, headers: NO_STORE });
  }
  if (typeof input.phone !== "string") {
    return NextResponse.json({ status: "denied" }, { status: 400, headers: NO_STORE });
  }
  const result = await verifyPhoneOtp({
    request,
    phone: input.phone,
    token: input.token,
    expectedOrigin: getCorralioSiteOrigin(),
    authenticated: createCorralioSupabaseServerClient(),
    admin: createCorralioSupabaseAdminClient(),
    hmacSecret: process.env.CORRALIO_SMS_CHANNEL_HMAC_SECRET,
  });
  return NextResponse.json(result, {
    status: result.status === "verified" ? 200 : 400,
    headers: NO_STORE,
  });
}
