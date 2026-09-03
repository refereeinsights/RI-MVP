import { NextResponse } from "next/server";

import { handleVerifiedSmsHook, type SmsProviderAdapter } from "@/lib/sms/durableSafety";
import { createSmsDurableSafetyGateway } from "@/lib/sms/durableSafety.server";
import { createTelnyxSmsProvider } from "@/lib/sms/telnyxProvider.server";
import { createCorralioSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const success = () => NextResponse.json({}, { status: 200, headers: NO_STORE });
const denied = (status: number) => NextResponse.json(
  { error: { http_code: status, message: "SMS request denied" } },
  { status, headers: NO_STORE },
);

function provider(): SmsProviderAdapter {
  const mode = process.env.CORRALIO_PHONE_AUTH_SMS_PROVIDER;
  if (mode === "mock") return { async send() { return { outcome: "accepted" }; } };
  if (mode === "telnyx") return createTelnyxSmsProvider();
  throw new Error("SMS provider is disabled");
}

export async function POST(request: Request) {
  if (process.env.CORRALIO_PHONE_AUTH_SMS_HOOK_ENABLED !== "true") return denied(404);
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 16_384) return denied(400);
  let adapter: SmsProviderAdapter;
  try { adapter = provider(); } catch { return denied(404); }
  const result = await handleVerifiedSmsHook({
    rawBody,
    headers: request.headers,
    webhookSecret: process.env.CORRALIO_SMS_SEND_HOOK_SECRET,
    hmacSecret: process.env.CORRALIO_SMS_CHANNEL_HMAC_SECRET,
    gateway: createSmsDurableSafetyGateway(createCorralioSupabaseAdminClient()),
    provider: adapter,
  });
  if (result.status === "attempted" || result.decision === "duplicate") return success();
  return denied(result.failureClass === "transient" ? 503 : 400);
}
