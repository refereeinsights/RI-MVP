import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await ctx.params;
  const runId = String(id ?? "").trim();
  if (!runId) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("discovery_csv_runs" as any)
    .select("id,sport,state,date_range_start,date_range_end,run_mode,status,master_csv,master_csv_row_count,generated_prompt_plan,created_at,updated_at,notes,import_started_at,import_finished_at")
    .eq("id", runId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { data: uploads } = await supabaseAdmin
    .from("discovery_csv_run_upload_links" as any)
    .select("id,created_at,notice_text,created_count,updated_count,rejected_count,failed_count,import_status")
    .eq("csv_run_id", runId)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({ ok: true, run: data, uploads: uploads ?? [] });
}

