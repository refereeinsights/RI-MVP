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
    body = {};
  }

  const ids = Array.isArray(body?.tournament_ids)
    ? body.tournament_ids
        .map((v: unknown) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean)
    : [];
  const uniqueIds = Array.from(new Set(ids));
  if (!uniqueIds.length) {
    return NextResponse.json({ error: "missing_tournament_ids" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { data: tournaments, error: tournamentsError } = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,do_not_contact")
    .in("id", uniqueIds);
  if (tournamentsError) {
    return NextResponse.json({ error: tournamentsError.message ?? "fetch_failed" }, { status: 500 });
  }

  const candidates = (tournaments ?? []).filter((row: any) => row?.id && !row?.do_not_contact);
  if (!candidates.length) {
    return NextResponse.json({
      updated: 0,
      already_dnc: uniqueIds.length,
      updated_ids: [],
    });
  }

  const candidateIds = candidates.map((row: any) => row.id);
  const { error: updateError } = await supabaseAdmin
    .from("tournaments" as any)
    .update({
      do_not_contact: true,
      do_not_contact_at: nowIso,
      do_not_contact_reason: "no_email_contact_found_on_website",
    })
    .in("id", candidateIds);
  if (updateError) {
    return NextResponse.json({ error: updateError.message ?? "update_failed" }, { status: 500 });
  }

  await supabaseAdmin
    .from("tournament_outreach" as any)
    .update({ status: "suppressed" })
    .in("tournament_id", candidateIds);

  return NextResponse.json({
    updated: candidateIds.length,
    already_dnc: uniqueIds.length - candidateIds.length,
    updated_ids: candidateIds,
  });
}
