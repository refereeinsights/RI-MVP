import { NextResponse } from "next/server";

import { isCorralioCronAuthorized } from "@/lib/cronAuth";
import { runCorralioScheduledRefresh } from "@/lib/schedules/refresh";
import { createCorralioRefreshSupabaseStore } from "@/lib/schedules/refreshSupabaseStore";
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
    // This route deliberately uses only the trusted admin client. It never
    // creates a user-scoped Supabase client or reads an authenticated session.
    const store = createCorralioRefreshSupabaseStore(createCorralioSupabaseAdminClient());
    const result = await runCorralioScheduledRefresh(store);
    console.info("[corralio][scheduled-refresh] completed", result);
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch {
    console.error("[corralio][scheduled-refresh] batch failed", { code: "batch_failure" });
    return NextResponse.json({ ok: false, error: "refresh_unavailable" }, {
      status: 500,
      headers: NO_STORE_HEADERS,
    });
  }
}
