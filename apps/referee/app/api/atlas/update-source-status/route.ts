import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeSourceUrl } from "@/server/admin/sources";

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

export async function POST(req: Request) {
  const admin = await requireAdminUser();
  if (admin.error) return admin.error;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
  const action = typeof body?.action === "string" ? body.action.trim() : "";
  if (!rawUrl || !action) return jsonResponse({ error: "missing_fields" }, 400);

  const normalized = normalizeSourceUrl(rawUrl).canonical;
  const updates: { review_status?: string; is_active?: boolean } = {};

  if (action === "keep") {
    updates.review_status = "keep";
    updates.is_active = true;
  } else if (action === "dead") {
    updates.review_status = "dead";
    updates.is_active = false;
  } else if (action === "login_required") {
    updates.review_status = "login_required";
    updates.is_active = false;
  } else if (action === "pdf_only") {
    updates.review_status = "pdf_only";
    updates.is_active = false;
  } else {
    return jsonResponse({ error: "invalid_action" }, 400);
  }

  const { error } = await supabaseAdmin
    .from("tournament_sources" as any)
    .update({ ...updates, normalized_url: normalized, source_url: normalized, url: normalized })
    .or(`normalized_url.eq.${normalized},url.eq.${normalized}`)
    .is("tournament_id", null);

  if (error) return jsonResponse({ error: "update_failed", details: error.message }, 500);

  return jsonResponse({ ok: true, url: normalized, ...updates });
}
