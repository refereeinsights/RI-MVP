import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { runVenueScan } from "@/server/owlseye/jobs/runVenueScan";

type Sport = "soccer" | "basketball";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function authorizedAdmin(request: Request) {
  const token = process.env.OWLS_EYE_ADMIN_TOKEN;
  if (!token) return false;
  const header = request.headers.get("x-owls-eye-admin-token");
  return Boolean(header && header === token);
}

export async function POST(request: Request) {
  if (!authorizedAdmin(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const venueId = body?.venueId;
  const sport = body?.sport as Sport | undefined;
  const fieldMapUrl = body?.fieldMapUrl ?? null;
  const runId = body?.runId && typeof body.runId === "string" ? body.runId : randomUUID();

  if (!venueId || typeof venueId !== "string" || !isUuid(venueId)) {
    return NextResponse.json({ error: "invalid_venue_id" }, { status: 400 });
  }
  if (sport !== "soccer" && sport !== "basketball") {
    return NextResponse.json({ error: "invalid_sport" }, { status: 400 });
  }

  try {
    const result = await runVenueScan({ runId, venueId, sport, fieldMapUrl });
    const statusCode = result.status === "complete" ? 200 : 500;
    return NextResponse.json({ runId, status: result.status, message: result.message }, { status: statusCode });
  } catch (err) {
    return NextResponse.json(
      { runId, status: "failed", message: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
