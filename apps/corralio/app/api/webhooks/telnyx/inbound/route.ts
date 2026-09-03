import { NextResponse } from "next/server";

import { processSmsScheduleIntake } from "@/lib/sms/scheduleIntake";
import { createSmsScheduleIntakeDependencies } from "@/lib/sms/scheduleIntake.server";
import { verifyAndParseTelnyxInbound } from "@/lib/sms/telnyxInbound";
import { createCorralioSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable() { return NextResponse.json({ status: "unavailable" }, { status: 404 }); }

export async function POST(request: Request) {
  // Stage 1 exposes only a deterministic mock-delivery seam. Live clarification
  // delivery remains closed until its separate production-readiness gate passes.
  if (process.env.CORRALIO_SMS_INTAKE_ENABLED !== "true"
    || process.env.CORRALIO_SMS_INTAKE_PROVIDER !== "mock") return unavailable();
  const rawBody = await request.text();
  let message;
  try {
    message = verifyAndParseTelnyxInbound({
      rawBody,
      headers: request.headers,
      publicKey: process.env.TELNYX_PUBLIC_KEY,
    });
  } catch {
    return NextResponse.json({ status: "denied" }, { status: 400 });
  }
  const result = await processSmsScheduleIntake(
    createSmsScheduleIntakeDependencies({
      admin: createCorralioSupabaseAdminClient(),
      channelHmacSecret: process.env.CORRALIO_SMS_CHANNEL_HMAC_SECRET,
      async sendReply() {
        // Deliberately no payload logging and no provider call in Stage 1.
        console.info("[corralio][sms-intake] mock clarification recorded");
      },
    }),
    message,
  );
  return NextResponse.json({ status: result.status === "denied" ? "denied" : "accepted" }, {
    status: result.status === "denied" ? 400 : 200,
  });
}
