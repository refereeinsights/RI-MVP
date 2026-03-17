import { NextRequest, NextResponse } from "next/server";
import { getTiOutreachAdminUser } from "@/lib/outreachAdmin";
import { getOutreachGuardSecret, isValidEmail } from "@/lib/outreach";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SuppressionBody = {
  tournament_id?: string;
  tournament_ids?: string[];
  sport?: string;
  director_email?: string;
  reason?: string;
  preview_id?: string;
};

async function authorize(request: NextRequest) {
  const headerKey = request.headers.get("X-OUTREACH-KEY") || "";
  const expected = getOutreachGuardSecret();
  if (expected && headerKey === expected) {
    return { authorized: true, email: "" };
  }

  const user = await getTiOutreachAdminUser();
  return {
    authorized: !!user,
    email: user?.email?.trim().toLowerCase() || "",
  };
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: SuppressionBody;
  try {
    body = (await request.json()) as SuppressionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const tournamentId = (body.tournament_id || "").trim();
  const tournamentIds = Array.isArray(body.tournament_ids)
    ? body.tournament_ids.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const sport = (body.sport || "").trim().toLowerCase();
  const directorEmail = (body.director_email || "").trim().toLowerCase();
  const reason = (body.reason || "removed").trim() || "removed";
  const previewId = (body.preview_id || "").trim();

  const idsToSuppress = Array.from(new Set([tournamentId, ...tournamentIds].filter(Boolean)));
  if (idsToSuppress.length === 0) {
    return NextResponse.json({ error: "tournament_id is required." }, { status: 400 });
  }
  if (!sport) {
    return NextResponse.json({ error: "sport is required." }, { status: 400 });
  }
  if (directorEmail && !isValidEmail(directorEmail)) {
    return NextResponse.json({ error: "director_email must be valid." }, { status: 400 });
  }

  const rows = idsToSuppress.map((id) => ({
    tournament_id: id,
    sport,
    director_email: directorEmail || null,
    reason,
    status: "removed",
    created_by_email: auth.email || null,
  }));

  const { error: upsertError } = await (supabaseAdmin.from("email_outreach_suppressions" as any) as any).upsert(rows, {
    onConflict: "tournament_id",
  });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  if (previewId) {
    const { error: deleteError } = await (supabaseAdmin.from("email_outreach_previews" as any) as any)
      .delete()
      .eq("id", previewId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
