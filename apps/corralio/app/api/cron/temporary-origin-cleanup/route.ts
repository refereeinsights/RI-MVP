import { NextResponse } from "next/server";

import { isCorralioCronAuthorized } from "@/lib/cronAuth";
import { cleanupExpiredTemporaryOrigins } from "@/lib/temporaryOrigin.server";
import { TEMPORARY_ORIGIN_CLEANUP_LIMIT } from "@/lib/temporaryOrigin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request: Request) {
  if (!isCorralioCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, {
      status: 401,
      headers: NO_STORE_HEADERS,
    });
  }
  try {
    const result = await cleanupExpiredTemporaryOrigins(TEMPORARY_ORIGIN_CLEANUP_LIMIT);
    console.info("[corralio][temporary-origin-cleanup] completed", result);
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE_HEADERS });
  } catch {
    console.error("[corralio][temporary-origin-cleanup] failed", { code: "cleanup_failure" });
    return NextResponse.json({ ok: false, error: "cleanup_unavailable" }, {
      status: 500,
      headers: NO_STORE_HEADERS,
    });
  }
}
