import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { HttpError, runPerplexityChunk } from "@/lib/admin/tiDiscoveryPerplexity";

export const runtime = "nodejs";

// Vercel serverless functions have execution time limits; keep this conservative.
// The UI will call this once per quarter/month selection (typically 1–3 chunks).
const MAX_CHUNKS_PER_REQUEST = 6;

type Chunk = { date_start: string; date_end: string; additional_context?: string };
type Body = {
  sport: string;
  state: string;
  future_only?: boolean;
  chunks: Chunk[];
};

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "").trim());
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await ctx.params;
  const runId = String(id ?? "").trim();
  if (!runId) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });

  const sport = String(body.sport ?? "").trim();
  const state = String(body.state ?? "").trim();
  const futureOnly = body.future_only !== false;
  const chunks = Array.isArray(body.chunks) ? body.chunks : [];

  if (!sport) return NextResponse.json({ ok: false, error: "sport is required" }, { status: 400 });
  if (!state) return NextResponse.json({ ok: false, error: "state is required" }, { status: 400 });
  if (!chunks.length) return NextResponse.json({ ok: false, error: "chunks is required" }, { status: 400 });
  if (chunks.length > MAX_CHUNKS_PER_REQUEST) {
    return NextResponse.json({ ok: false, error: `Too many chunks (max ${MAX_CHUNKS_PER_REQUEST}).` }, { status: 400 });
  }
  for (const c of chunks) {
    if (!isIsoDate(c?.date_start) || !isIsoDate(c?.date_end)) {
      return NextResponse.json({ ok: false, error: "All chunks must include date_start and date_end in YYYY-MM-DD format." }, { status: 400 });
    }
    if (String(c.date_start) > String(c.date_end)) {
      return NextResponse.json({ ok: false, error: "chunk date_start must be <= date_end" }, { status: 400 });
    }
    if (c.additional_context && String(c.additional_context).trim().length > 300) {
      return NextResponse.json({ ok: false, error: "additional_context exceeds 300 characters" }, { status: 400 });
    }
  }

  const results: any[] = [];

  for (const c of chunks) {
    const dateStart = String(c.date_start);
    const dateEnd = String(c.date_end);
    const additionalContext = c.additional_context != null ? String(c.additional_context) : null;
    try {
      const r = await runPerplexityChunk({
        userId: user.id,
        runId,
        sport,
        state,
        dateStart,
        dateEnd,
        futureOnly,
        additionalContext,
        bypassRateLimit: true,
      });
      results.push({ date_start: dateStart, date_end: dateEnd, ok: true, ...r });
    } catch (err: any) {
      const status = err instanceof HttpError ? err.status : typeof err?.status === "number" ? err.status : 500;
      results.push({
        date_start: dateStart,
        date_end: dateEnd,
        ok: false,
        error: String(err?.message ?? "Unknown error"),
        ...(err instanceof HttpError ? err.payload ?? {} : err?.payload ?? {}),
        status,
      });
      // 400 = content error for this chunk (no tournaments, truncated, bad JSON) — continue to next chunk.
      // Auth/run-state/server errors affect all chunks, so stop.
      if (status !== 400) break;
    }
  }

  const allOk = results.length === chunks.length && results.every((r) => r.ok === true);
  return NextResponse.json({ ok: allOk, results });
}
