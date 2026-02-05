import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
  const suggestionId = typeof body?.suggestion_id === "string" ? body.suggestion_id : "";
  if (!suggestionId) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const updateSuggestion = await supabaseAdmin
    .from("tournament_url_suggestions" as any)
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.id,
    })
    .eq("id", suggestionId);
  if (updateSuggestion.error) {
    console.error("[url-suggestions] suggestion update failed", updateSuggestion.error);
    return NextResponse.json({ error: "suggestion_update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
