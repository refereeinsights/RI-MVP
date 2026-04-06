import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runVenueCsvImport } from "@/server/admin/venueImport";

function jsonResponse(body: any, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function ensureAdminRequest() {
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
  const adminUser = await ensureAdminRequest();
  if (!adminUser) return jsonResponse({ error: "unauthorized" }, 401);

  let payload: any = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const dryRun = payload?.dryRun !== false;
  const filename = typeof payload?.filename === "string" ? payload.filename.trim() : null;
  const rowsRaw = Array.isArray(payload?.rows) ? payload.rows : [];

  const MAX_ROWS = 5000;
  if (rowsRaw.length > MAX_ROWS) {
    return jsonResponse({ error: `too_many_rows (${rowsRaw.length}); max ${MAX_ROWS}` }, 400);
  }

  try {
    const res = await runVenueCsvImport({
      createdBy: adminUser.id,
      filename,
      dryRun,
      rows: rowsRaw,
    });
    return jsonResponse(res);
  } catch (err: any) {
    return jsonResponse({ error: "internal_error", message: String(err?.message ?? "unknown") }, 500);
  }
}

