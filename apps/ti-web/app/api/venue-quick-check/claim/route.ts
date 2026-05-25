import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  // Promo deprecated: do not grant free 12-month Weekend Pro access for quick-check submissions.
  // Keep the endpoint to avoid breaking old bookmarked links, but fail closed.
  return NextResponse.json({ ok: false, error: "This promotion is no longer available." }, { status: 410 });
}

