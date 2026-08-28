import { NextResponse } from "next/server";

import { isCorralioCronAuthorized } from "@/lib/cronAuth";
import { runWeekendReadyWorker } from "@/lib/notifications/weekendReady.server";
import { createCorralioSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request: Request) {
  if (!isCorralioCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, {
      status: 401,
      headers: NO_STORE_HEADERS,
    });
  }

  try {
    const result = await runWeekendReadyWorker(createCorralioSupabaseAdminClient());
    console.info("[corralio][weekend-ready] completed", result);
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE_HEADERS });
  } catch {
    console.error("[corralio][weekend-ready] batch failed", { code: "batch_failure" });
    return NextResponse.json({ ok: false, error: "push_unavailable" }, {
      status: 500,
      headers: NO_STORE_HEADERS,
    });
  }
}
