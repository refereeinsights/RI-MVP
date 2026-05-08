import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { HttpError, runPerplexityChunk } from "@/lib/admin/tiDiscoveryPerplexity";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  sport: string;
  state: string;
  date_start: string;
  date_end: string;
  future_only?: boolean;
  additional_context?: string;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await ctx.params;
  const runId = String(id ?? "").trim();
  if (!runId) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });

  try {
    const result = await runPerplexityChunk({
      userId: user.id,
      runId,
      sport: body.sport,
      state: body.state,
      dateStart: body.date_start,
      dateEnd: body.date_end,
      futureOnly: body.future_only !== false,
      additionalContext: body.additional_context ?? null,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof HttpError) {
      return NextResponse.json({ ok: false, error: err.message, ...(err.payload ?? {}) }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}

