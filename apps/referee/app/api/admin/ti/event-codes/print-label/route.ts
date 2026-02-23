import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildEventCodeLabelPdf } from "@/lib/pdf/eventCodeLabel";

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
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const code = String(payload?.code ?? "").trim();
  const foundingAccess = Boolean(payload?.foundingAccess);
  const quantityRaw = Number(payload?.quantity ?? 1);
  const quantity = Number.isFinite(quantityRaw) ? Math.max(1, Math.min(500, Math.floor(quantityRaw))) : 1;

  if (!code) {
    return NextResponse.json({ error: "code_required" }, { status: 400 });
  }

  let pdf: string;
  try {
    pdf = buildEventCodeLabelPdf({ code, foundingAccess, quantity });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "pdf_generation_failed" }, { status: 400 });
  }

  return new Response(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=\"event-code-${encodeURIComponent(code)}.pdf\"`,
      "Cache-Control": "no-store",
    },
  });
}
