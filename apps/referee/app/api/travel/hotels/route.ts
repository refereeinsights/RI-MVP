import { NextResponse } from "next/server";

import { buildTravelPropertyHandoff, parseTravelSearchInput } from "@/lib/travel/travelContracts";
import { getTiTravelOrigin, searchTravelHotels } from "@/lib/travel/travelHotels.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "Invalid search request." }, { status: 400 });
  }
  const parsed = parseTravelSearchInput(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: "error" in parsed ? parsed.error : "Invalid search request." }, { status: 400 });

  const result = await searchTravelHotels(parsed.value);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });

  return NextResponse.json({
    ok: true,
    hotels: result.hotels.map((hotel) => ({
      ...hotel,
      handoffUrl: buildTravelPropertyHandoff({
        tiOrigin: getTiTravelOrigin(),
        hotel,
        search: parsed.value,
        lodgingSearchId: result.sessionId,
      }),
    })),
  });
}
