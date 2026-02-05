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

  const { data: row, error } = await supabaseAdmin
    .from("tournament_url_suggestions" as any)
    .select("id,tournament_id,suggested_url")
    .eq("id", suggestionId)
    .maybeSingle();
  const suggestion = row as { id: string; tournament_id: string; suggested_url: string } | null;
  if (error || !suggestion) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const updateTournament = await supabaseAdmin
    .from("tournaments" as any)
    .update({ official_website_url: suggestion.suggested_url })
    .eq("id", suggestion.tournament_id);
  if (updateTournament.error) {
    console.error("[url-suggestions] tournament update failed", updateTournament.error);
    return NextResponse.json({ error: "tournament_update_failed" }, { status: 500 });
  }

  const updateSuggestion = await supabaseAdmin
    .from("tournament_url_suggestions" as any)
    .update({
      status: "approved",
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
