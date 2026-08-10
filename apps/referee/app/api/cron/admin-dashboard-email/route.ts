import { NextResponse } from "next/server";
import { parseRiAdminDashboardRecipients, sendRiAnalyticsDashboardEmail } from "@/lib/riAdminDashboardEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAuthorized(req: Request) {
  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  const tokenFromHeader = req.headers.get("x-cron-secret");
  const token = (tokenFromQuery ?? tokenFromHeader ?? "").trim();
  if (Boolean(process.env.CRON_SECRET && token && token === process.env.CRON_SECRET)) return true;
  // Accept Vercel's own cron invocation header in production as a fallback.
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const isProd = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";
  return Boolean(isVercelCron && isProd);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendRiAnalyticsDashboardEmail();
    return NextResponse.json({
      ok: true,
      recipients: result.recipients,
      totalEvents: result.summary.totalEvents,
      uniqueEvents: result.summary.uniqueEventNames,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
