import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { queueEnrichmentJobs } from "@/server/enrichment/pipeline";

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
  const ids = Array.isArray(body?.tournament_ids) ? body.tournament_ids.filter((id: any) => typeof id === "string") : [];
  if (!ids.length) {
    return NextResponse.json({ error: "no_ids" }, { status: 400 });
  }

  try {
    const res = await queueEnrichmentJobs(ids);
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    console.error("[enrichment] queue failed", err);
    return NextResponse.json({ error: "queue_failed" }, { status: 500 });
  }
}
