import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeSourceUrl } from "@/server/admin/sources";

async function ensureAdmin() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") return null;
  return data.user;
}

type ApplyRow = { tournament_id: string; candidate_url: string };

export async function POST(request: Request) {
  const admin = await ensureAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rows = Array.isArray(body?.rows) ? (body.rows as ApplyRow[]) : [];
  if (!rows.length) {
    return NextResponse.json({ error: "missing_rows" }, { status: 400 });
  }

  const updates: { tournament_id: string; normalized: string }[] = [];
  const errors: { tournament_id: string; error: string }[] = [];

  for (const row of rows) {
    const tournamentId = typeof row?.tournament_id === "string" ? row.tournament_id : "";
    const candidateUrl = typeof row?.candidate_url === "string" ? row.candidate_url : "";
    if (!tournamentId || !candidateUrl) {
      errors.push({ tournament_id: tournamentId || "unknown", error: "missing_fields" });
      continue;
    }
    const normalized = normalizeSourceUrl(candidateUrl).normalized;
    if (!normalized) {
      errors.push({ tournament_id: tournamentId, error: "invalid_url" });
      continue;
    }
    updates.push({ tournament_id: tournamentId, normalized });
  }

  for (const row of updates) {
    const updateResp = await supabaseAdmin
      .from("tournaments" as any)
      .update({ official_website_url: row.normalized })
      .eq("id", row.tournament_id);
    if (updateResp.error) {
      console.error("[enrichment] batch apply failed", updateResp.error);
      errors.push({ tournament_id: row.tournament_id, error: "apply_failed" });
      continue;
    }
    await supabaseAdmin
      .from("tournament_url_candidates" as any)
      .update({ auto_applied: true, applied_at: new Date().toISOString() })
      .eq("tournament_id", row.tournament_id)
      .eq("candidate_url", row.normalized);
  }

  return NextResponse.json({
    ok: true,
    applied: updates.length - errors.length,
    total: rows.length,
    errors,
  });
}
