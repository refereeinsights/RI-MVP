import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { refreshIcsSource } from "@/lib/planner/ics-import";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const sourceId = String(id ?? "").trim();
  if (!sourceId) return NextResponse.json({ ok: false, error: "missing_source_id" }, { status: 400 });

  const res = await refreshIcsSource({ supabase, userId: user.id, sourceId });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });

  return NextResponse.json({
    ok: true,
    sourceId: res.sourceId,
    sourceName: res.sourceName,
    imported: res.imported,
    updated: res.updated,
    changed: res.changed,
    skipped: res.skipped,
    changedEvents: res.changedEvents ?? [],
    errors: res.errors,
  });
}
