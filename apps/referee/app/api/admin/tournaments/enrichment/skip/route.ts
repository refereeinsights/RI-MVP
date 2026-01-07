import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { tournament_id: string };
    const tournament_id = body?.tournament_id;
    if (!tournament_id) {
      return NextResponse.json({ error: "missing_tournament_id" }, { status: 400 });
    }
    // Mark tournament as skipped and delete queued/running jobs.
    const { error: updateErr } = await supabaseAdmin
      .from("tournaments" as any)
      .update({ enrichment_skip: true })
      .eq("id", tournament_id);
    if (updateErr) throw updateErr;

    await supabaseAdmin
      .from("tournament_enrichment_jobs" as any)
      .delete()
      .eq("tournament_id", tournament_id)
      .in("status", ["queued", "running"]);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "unknown_error" }, { status: 500 });
  }
}
