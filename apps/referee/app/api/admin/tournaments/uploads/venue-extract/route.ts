import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { extractVenueCandidatesFromHtml, fetchPageHtml } from "@/lib/pageScanner";

export const runtime = "nodejs";

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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(request: Request) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tournamentId = (searchParams.get("tournament_id") ?? "").trim();
  if (!isUuid(tournamentId)) {
    return NextResponse.json({ error: "invalid_tournament_id" }, { status: 400 });
  }

  const { data: t, error: tErr } = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,name,official_website_url,source_url")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!t) return NextResponse.json({ error: "tournament_not_found" }, { status: 404 });

  const url = String((t as any).official_website_url ?? (t as any).source_url ?? "").trim();
  if (!url) return NextResponse.json({ error: "missing_source_url" }, { status: 400 });

  const html = await fetchPageHtml(url);
  if (!html) return NextResponse.json({ error: "fetch_failed" }, { status: 502 });

  const candidates = extractVenueCandidatesFromHtml(html);
  return NextResponse.json({
    ok: true,
    tournament_id: tournamentId,
    tournament_name: (t as any).name ?? null,
    source_url_used: url,
    candidates,
  });
}

