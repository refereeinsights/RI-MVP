import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildMasterCsv, parseDiscoveryV2CsvChunk, toCandidateInsert } from "@/lib/admin/tiDiscoveryV2Csv";

export const runtime = "nodejs";

type Body = {
  raw_paste: string;
  notes?: string | null;
  future_only?: boolean;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await ctx.params;
  const runId = String(id ?? "").trim();
  if (!runId) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });

  const rawPaste = String(body.raw_paste ?? "");
  if (!rawPaste.trim()) return NextResponse.json({ ok: false, error: "raw_paste is required" }, { status: 400 });

  // Always store the raw paste as a discovery batch for auditability.
  const { data: batch, error: batchErr } = await supabaseAdmin
    .from("discovery_batches" as any)
    .insert({
      created_by: user.id,
      discovery_search_id: null,
      raw_paste: rawPaste,
      provider: "chatgpt_manual",
      notes: body.notes ? String(body.notes).trim() : null,
    })
    .select("id")
    .single();
  if (batchErr) return NextResponse.json({ ok: false, error: batchErr.message }, { status: 500 });

  const batchId = String((batch as any).id);

  const parsed = parseDiscoveryV2CsvChunk({ csvText: rawPaste, futureOnly: body.future_only !== false });

  if (parsed.ok === false) {
    await supabaseAdmin.from("discovery_batch_parse_log" as any).insert({
      batch_id: batchId,
      parse_status: "failed",
      error_summary: parsed.error,
      warnings: null,
      row_count_detected: parsed.detected,
      row_count_accepted: 0,
    });
    return NextResponse.json({ ok: false, batch_id: batchId, error: parsed.error }, { status: 400 });
  }

  await supabaseAdmin.from("discovery_batch_parse_log" as any).insert({
    batch_id: batchId,
    parse_status: "ok",
    error_summary: null,
    warnings: parsed.warnings.length ? parsed.warnings : null,
    row_count_detected: parsed.detected,
    row_count_accepted: parsed.rows.length,
  });

  // Attach the batch to the run.
  const { error: attachErr } = await supabaseAdmin.from("discovery_csv_run_batches" as any).insert({
    csv_run_id: runId,
    batch_id: batchId,
  });
  if (attachErr) {
    return NextResponse.json({ ok: false, batch_id: batchId, error: attachErr.message }, { status: 500 });
  }

  // Save candidates for queue/review (reuses V1 candidates table).
  const candidateRows = parsed.rows.map((row) => toCandidateInsert({ batchId, row }));
  const { error: candErr } = await supabaseAdmin.from("tournament_discovery_candidates" as any).insert(candidateRows);
  if (candErr) {
    return NextResponse.json({ ok: false, batch_id: batchId, error: candErr.message }, { status: 500 });
  }

  // Rebuild master CSV by re-parsing all raw pastes in the run (preserves full per-venue columns).
  const { data: joined, error: joinErr } = await supabaseAdmin
    .from("discovery_csv_run_batches" as any)
    .select("batch_id,discovery_batches(raw_paste)")
    .eq("csv_run_id", runId);
  if (joinErr) {
    return NextResponse.json({ ok: false, batch_id: batchId, error: joinErr.message }, { status: 500 });
  }

  const allRows: any[] = [];
  for (const r of joined ?? []) {
    const raw = String((r as any).discovery_batches?.raw_paste ?? "");
    const parsedBatch = parseDiscoveryV2CsvChunk({ csvText: raw, futureOnly: body.future_only !== false });
    if (parsedBatch.ok) {
      allRows.push(...parsedBatch.rows);
    }
  }

  const master = buildMasterCsv(allRows as any);

  await supabaseAdmin
    .from("discovery_csv_runs" as any)
    .update({ master_csv: master.csv, master_csv_row_count: master.rowCount })
    .eq("id", runId);

  return NextResponse.json({
    ok: true,
    batch_id: batchId,
    accepted: parsed.rows.length,
    warnings: parsed.warnings,
    master_csv_row_count: master.rowCount,
  });
}
