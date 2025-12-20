import { NextResponse } from "next/server";
import { recomputeAllWhistleScores } from "@/lib/whistleScores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAuthorized(req: Request, bodyToken?: string | null) {
  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  const token = tokenFromQuery ?? bodyToken ?? null;
  return Boolean(process.env.CRON_SECRET && token === process.env.CRON_SECRET);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await recomputeAllWhistleScores();
  return NextResponse.json({
    ok: true,
    triggeredAt: new Date().toISOString(),
    result,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!isAuthorized(request, body?.token ?? null)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await recomputeAllWhistleScores();
  return NextResponse.json({
    ok: true,
    triggeredAt: new Date().toISOString(),
    result,
  });
}
