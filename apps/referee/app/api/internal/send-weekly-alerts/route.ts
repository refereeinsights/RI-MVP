import { NextResponse } from "next/server";
import { runWeeklyAlertJob } from "@/lib/alerts/sendWeeklyDigest";

export async function POST(req: Request) {
  const cronHeader = req.headers.get("x-cron-secret") ?? undefined;

  try {
    const result = await runWeeklyAlertJob({ cronSecretHeader: cronHeader });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[alerts] job failed", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
