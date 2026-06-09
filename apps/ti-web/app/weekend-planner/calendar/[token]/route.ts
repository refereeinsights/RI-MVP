import { NextResponse } from "next/server";

import {
  isPlausiblePlannerCalendarFeedToken,
  loadPlannerCalendarFeedByToken,
  serializePlannerCalendarFeed,
} from "@/lib/planner/calendarFeeds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
) {
  const token = decodeURIComponent(String(params.token ?? "")).trim();
  if (!token || !isPlausiblePlannerCalendarFeedToken(token)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const feed = await loadPlannerCalendarFeedByToken(token);
  const body = serializePlannerCalendarFeed(feed);

  return new NextResponse(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "private, no-store",
      "content-disposition": 'inline; filename="tournamentinsights-family-schedule.ics"',
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}
