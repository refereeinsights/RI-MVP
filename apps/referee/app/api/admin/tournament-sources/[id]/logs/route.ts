import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonResponse(body: any, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function requireAdminUser() {
  const supa = createSupabaseServerClient();
  const { data, error } = await supa.auth.getUser();
  if (error || !data.user) {
    return { error: jsonResponse({ error: "not_authenticated" }, 401) };
  }
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("user_id, role")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    return { error: jsonResponse({ error: "not_authorized" }, 403) };
  }
  return { user: data.user };
}

export async function GET(req: Request, context: { params: { id: string } }) {
  const admin = await requireAdminUser();
  if (admin.error) return admin.error;

  const sourceId = context.params.id;
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));

  const { data, error } = await supabaseAdmin
    .from("tournament_source_logs" as any)
    .select("id,action,level,payload,created_at")
    .eq("source_id", sourceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return jsonResponse({ error: "fetch_failed", details: error.message }, 500);

  return jsonResponse({ source_id: sourceId, logs: data ?? [] });
}
