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

export async function POST(request: Request) {
  const admin = await ensureAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const tournamentId = typeof body?.tournament_id === "string" ? body.tournament_id : "";
  const candidateUrl = typeof body?.candidate_url === "string" ? body.candidate_url : "";
  if (!tournamentId || !candidateUrl) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const normalized = normalizeSourceUrl(candidateUrl).normalized;
  if (!normalized) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  const updateResp = await supabaseAdmin
    .from("tournaments" as any)
    .update({ official_website_url: normalized })
    .eq("id", tournamentId);
  if (updateResp.error) {
    console.error("[enrichment] manual apply failed", updateResp.error);
    return NextResponse.json({ error: "apply_failed" }, { status: 500 });
  }

  await supabaseAdmin
    .from("tournament_url_candidates" as any)
    .update({ auto_applied: true, applied_at: new Date().toISOString() })
    .eq("tournament_id", tournamentId)
    .eq("candidate_url", normalized);

  return NextResponse.json({ ok: true, candidate_url: normalized });
}
