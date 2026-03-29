import { NextRequest, NextResponse } from "next/server";
import { getTiOutreachAdminUser } from "@/lib/outreachAdmin";
import { getOutreachGuardSecret, isValidEmail } from "@/lib/outreach";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Body = {
  tournament_id?: string;
  director_email?: string;
  preview_id?: string;
};

async function authorize(request: NextRequest) {
  const headerKey = request.headers.get("X-OUTREACH-KEY") || "";
  const expected = getOutreachGuardSecret();
  if (expected && headerKey === expected) {
    return { authorized: true };
  }

  const user = await getTiOutreachAdminUser();
  return { authorized: !!user };
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.authorized) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const tournamentId = String(body.tournament_id ?? "").trim();
  const directorEmail = String(body.director_email ?? "").trim().toLowerCase();
  const previewId = String(body.preview_id ?? "").trim();

  if (!tournamentId) return NextResponse.json({ error: "tournament_id is required." }, { status: 400 });
  if (!directorEmail || !isValidEmail(directorEmail)) {
    return NextResponse.json({ error: "A valid director_email is required." }, { status: 400 });
  }

  const { error: tournamentError } = await (supabaseAdmin.from("tournaments" as any) as any)
    .update({ tournament_director_email: directorEmail })
    .eq("id", tournamentId);
  if (tournamentError) return NextResponse.json({ error: tournamentError.message }, { status: 500 });

  // Keep outreach previews in sync for this tournament (helps resend flows).
  const previewQuery = (supabaseAdmin.from("email_outreach_previews" as any) as any).update({ director_email: directorEmail });
  const { error: previewError } = previewId
    ? await previewQuery.eq("id", previewId)
    : await previewQuery.eq("tournament_id", tournamentId);
  if (previewError) return NextResponse.json({ error: previewError.message }, { status: 500 });

  return NextResponse.json({ ok: true }, { status: 200 });
}

