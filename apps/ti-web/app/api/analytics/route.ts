import { NextResponse } from "next/server";

type AnalyticsRequest = {
  event?: string;
  properties?: Record<string, unknown>;
};

export async function POST(request: Request) {
  let payload: AnalyticsRequest | null = null;

  try {
    payload = (await request.json()) as AnalyticsRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid analytics payload." }, { status: 400 });
  }

  if (!payload?.event || typeof payload.event !== "string") {
    return NextResponse.json({ ok: false, error: "Event is required." }, { status: 400 });
  }

  console.info(
    "[ti-analytics]",
    JSON.stringify({
      event: payload.event,
      properties: payload.properties ?? {},
      received_at: new Date().toISOString(),
    })
  );

  return NextResponse.json({ ok: true });
}
