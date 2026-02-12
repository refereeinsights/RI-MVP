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

  const { data: tournaments, error: tournamentsError } = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,tournament_director,tournament_director_email,do_not_contact")
    .in("id", uniqueIds);
  if (tournamentsError) {
    return NextResponse.json({ error: tournamentsError.message ?? "fetch_failed" }, { status: 500 });
  }

  const eligible = (tournaments ?? []).filter((row: any) => !row?.do_not_contact && row?.id);
  if (!eligible.length) {
    return NextResponse.json({ created: 0, already_exists: 0, skipped_dnc: uniqueIds.length, created_ids: [] });
  }

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from("tournament_outreach" as any)
    .select("tournament_id")
    .in(
      "tournament_id",
      eligible.map((row: any) => row.id)
    );
  if (existingError) {
    return NextResponse.json({ error: existingError.message ?? "existing_fetch_failed" }, { status: 500 });
  }

  const existingSet = new Set((existingRows ?? []).map((row: any) => row.tournament_id));
  const toInsert = eligible
    .filter((row: any) => !existingSet.has(row.id))
    .map((row: any) => ({
      tournament_id: row.id,
      contact_name: row.tournament_director ?? null,
      contact_email: (row.tournament_director_email ?? "").trim(),
      status: "draft",
      notes: "priority_target_missing_both_emails_and_dates",
    }));

  if (!toInsert.length) {
    return NextResponse.json({ created: 0, already_exists: eligible.length, skipped_dnc: uniqueIds.length - eligible.length, created_ids: [] });
  }

  const { error: insertError } = await supabaseAdmin.from("tournament_outreach" as any).insert(toInsert);
  if (insertError) {
    return NextResponse.json({ error: insertError.message ?? "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({
    created: toInsert.length,
    already_exists: eligible.length - toInsert.length,
    skipped_dnc: uniqueIds.length - eligible.length,
    created_ids: toInsert.map((row: any) => row.tournament_id),
  });
}
