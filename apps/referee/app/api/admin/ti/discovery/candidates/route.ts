import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function asText(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const importStatus = asText(url.searchParams.get("import_status") ?? "");
  const confidence = asText(url.searchParams.get("confidence") ?? "");
  const dedupe = asText(url.searchParams.get("dedupe_status") ?? "");
  const batchId = asText(url.searchParams.get("batch_id") ?? "");
  const limitRaw = parseInt(asText(url.searchParams.get("limit") ?? "250"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 250;

  let q = supabaseAdmin
    .from("tournament_discovery_candidates" as any)
    .select(
      "id,created_at,discovery_search_id,discovery_batch_id,name,sport,start_date,end_date,city,state,venue_raw,organizer,official_website_url,source_url,source_domain,normalized_name,confidence_label,dedupe_status,dedupe_target_tournament_id,seen_before,seen_before_candidate_id,import_status,review_notes,imported_tournament_id",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (importStatus && importStatus !== "all") q = q.eq("import_status", importStatus);
  if (confidence && confidence !== "all") q = q.eq("confidence_label", confidence);
  if (dedupe && dedupe !== "all") q = q.eq("dedupe_status", dedupe);
  if (batchId) q = q.eq("discovery_batch_id", batchId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

type PatchBody = {
  id: string;
  confidence_label?: "high" | "medium" | "low";
  import_status?: "queued" | "rejected";
  review_notes?: string | null;
};

export async function PATCH(req: Request) {
  const user = await requireAdmin();
  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  const id = asText(body.id);
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const patch: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (body.confidence_label) patch.confidence_label = body.confidence_label;
  if (body.review_notes !== undefined) patch.review_notes = body.review_notes;
  if (body.import_status) {
    patch.import_status = body.import_status;
    patch.reviewed_by = user.id;
    patch.reviewed_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from("tournament_discovery_candidates" as any)
    .update(patch)
    .eq("id", id)
    .select("id,import_status,confidence_label")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, row: data });
}

