import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRegistryRowByUrl, normalizeSourceUrl, upsertRegistry } from "@/server/admin/sources";
import crypto from "crypto";

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

async function ensureAssignorSourceId(defaultSport: string | null, defaultState: string | null) {
  const SOURCE_URL = "atlas://discover";
  const SOURCE_NAME = "Atlas Discovery";

  const { data: existing, error } = await supabaseAdmin
    .from("assignor_sources" as any)
    .select("id")
    .eq("source_url", SOURCE_URL)
    .maybeSingle();
  if (error) throw new Error(`assignor_sources lookup failed: ${error.message}`);
  if (existing?.id) return existing.id as string;

  const { data: created, error: insertError } = await supabaseAdmin
    .from("assignor_sources" as any)
    .insert({
      source_name: SOURCE_NAME,
      source_url: SOURCE_URL,
      default_sport: defaultSport,
      default_state: defaultState,
      is_active: true,
    })
    .select("id")
    .single();
  if (insertError || !created?.id) {
    throw new Error(`assignor_sources insert failed: ${insertError?.message ?? "unknown error"}`);
  }
  return created.id as string;
}

function hashValue(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
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
  const target = typeof body?.target === "string" ? body.target.trim() : "tournament";
  const sport = typeof body?.sport === "string" ? body.sport.trim() : "";
  const source_type = typeof body?.source_type === "string" ? body.source_type.trim() : "";
  const state = typeof body?.state === "string" ? body.state.trim() : "";

  if (!rawUrl || !sport || (target === "tournament" && !source_type)) {
    return jsonResponse({ error: "missing_fields" }, 400);
  }

  const normalized = normalizeSourceUrl(rawUrl).canonical;

  if (target === "assignor") {
    const sourceId = await ensureAssignorSourceId(sport || null, state || null);
    const externalId = `atlas_${hashValue(normalized)}`;
    const { data: existing } = await supabaseAdmin
      .from("assignor_source_records" as any)
      .select("id")
      .eq("source_id", sourceId)
      .eq("external_id", externalId)
      .maybeSingle();
    if (existing?.id) return jsonResponse({ ok: true, status: "existing" });

    const raw = {
      name: body?.title ?? normalized,
      website_url: normalized,
      source_url: normalized,
      sport,
      state,
      search_title: body?.title ?? null,
      search_snippet: body?.snippet ?? null,
      discovered_via: "atlas",
    };
    const { error } = await supabaseAdmin.from("assignor_source_records" as any).insert({
      source_id: sourceId,
      external_id: externalId,
      raw,
      confidence: 35,
      review_status: "needs_review",
    });
    if (error) return jsonResponse({ error: "insert_failed", details: error.message }, 500);
    return jsonResponse({ ok: true, status: "inserted" });
  }

  const existing = await getRegistryRowByUrl(normalized);
  if (existing.row) return jsonResponse({ ok: true, status: "existing" });
  await upsertRegistry({
    source_url: normalized,
    source_type,
    sport,
    state: state || null,
    review_status: "needs_review",
    review_notes: "discovered via atlas",
    is_active: true,
  });
  return jsonResponse({ ok: true, status: "inserted" });
}
