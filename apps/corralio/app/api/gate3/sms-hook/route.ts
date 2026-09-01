import { NextResponse } from "next/server";

import { handleVerifiedSmsHook } from "@/lib/sms/durableSafety";
import { createSmsDurableSafetyGateway } from "@/lib/sms/durableSafety.server";
import { assertIsolatedSmsRuntimeConfiguration } from "@/lib/sms/isolatedRuntime";
import { createCorralioSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function hookError(status: number) {
  return NextResponse.json({ error: { http_code: status, message: "SMS request denied" } }, {
    status,
    headers: NO_STORE,
  });
}

export async function POST(request: Request) {
  try {
    assertIsolatedSmsRuntimeConfiguration(process.env);
  } catch {
    return hookError(404);
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 16_384) return hookError(400);

  let mockInvocations = 0;
  const result = await handleVerifiedSmsHook({
    rawBody,
    headers: request.headers,
    webhookSecret: process.env.CORRALIO_SMS_SEND_HOOK_SECRET,
    hmacSecret: process.env.CORRALIO_SMS_CHANNEL_HMAC_SECRET,
    gateway: createSmsDurableSafetyGateway(createCorralioSupabaseAdminClient()),
    provider: {
      async send() {
        mockInvocations += 1;
        console.info("[corralio][gate3] mock provider invoked", { count: 1, segments: 1 });
        return { outcome: "accepted" };
      },
    },
  });

  if (result.status === "attempted") {
    return new NextResponse(null, {
      status: 200,
      headers: { ...NO_STORE, "x-corralio-gate3-mock-invocations": String(mockInvocations) },
    });
  }
  if (result.decision === "duplicate") {
    return new NextResponse(null, {
      status: 200,
      headers: { ...NO_STORE, "x-corralio-gate3-mock-invocations": "0" },
    });
  }
  return hookError(result.failureClass === "transient" ? 503 : 400);
}
