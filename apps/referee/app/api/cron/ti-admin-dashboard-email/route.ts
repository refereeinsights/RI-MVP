import { NextResponse } from "next/server";
import { syncHotelPlannerBookings } from "@/lib/hotelPlannerBookingSync";
import { parseTiAdminDashboardRecipients, sendTiAdminDashboardEmail } from "@/lib/tiAdminDashboardEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAuthorized(req: Request) {
  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  const tokenFromHeader = req.headers.get("x-cron-secret");
  const token = (tokenFromQuery ?? tokenFromHeader ?? "").trim();
  if (process.env.CRON_SECRET && token && token === process.env.CRON_SECRET) return true;
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const isProd = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";
  return Boolean(isVercelCron && isProd);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const syncResult = await (async () => {
    try {
      return await syncHotelPlannerBookings(7);
    } catch (err: any) {
      console.error("[ti-admin-dashboard-email] booking sync failed", err?.message ?? err);
      return { error: err?.message ?? "Booking sync failed" };
    }
  })();

  try {
    const result = await sendTiAdminDashboardEmail();
    return NextResponse.json({
      ok: true,
      recipients: result.recipients,
      bookingSync: syncResult,
      generatedAt: result.summary.generatedAt,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Unknown error", bookingSync: syncResult },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
