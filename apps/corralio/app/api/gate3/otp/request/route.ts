import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { requestIsolatedSmsOtp, assertIsolatedSmsRuntimeConfiguration } from "@/lib/sms/isolatedRuntime";
import { createSmsDurableSafetyGateway } from "@/lib/sms/durableSafety.server";
import { createCorralioSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: Request) {
  let configuration: ReturnType<typeof assertIsolatedSmsRuntimeConfiguration>;
  try {
    configuration = assertIsolatedSmsRuntimeConfiguration(process.env);
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 404, headers: NO_STORE });
  }

  let input: { phone?: unknown; captchaToken?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > 8192) throw new Error("oversized");
    input = JSON.parse(raw) as typeof input;
  } catch {
    return NextResponse.json({ status: "denied" }, { status: 400, headers: NO_STORE });
  }
  if (typeof input.phone !== "string" || typeof input.captchaToken !== "string") {
    return NextResponse.json({ status: "denied" }, { status: 400, headers: NO_STORE });
  }

  const auth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const result = await requestIsolatedSmsOtp({
    request,
    phone: input.phone,
    captchaToken: input.captchaToken,
    expectedOrigin: configuration.siteOrigin,
    hmacSecret: process.env.CORRALIO_SMS_CHANNEL_HMAC_SECRET!,
    gateway: createSmsDurableSafetyGateway(createCorralioSupabaseAdminClient()),
    signInWithOtp: async ({ phone, captchaToken }) => {
      const { error } = await auth.auth.signInWithOtp({
        phone,
        options: { captchaToken, shouldCreateUser: false },
      });
      return { error };
    },
  });
  return NextResponse.json(result, {
    status: result.status === "pending" ? 202 : 400,
    headers: NO_STORE,
  });
}
