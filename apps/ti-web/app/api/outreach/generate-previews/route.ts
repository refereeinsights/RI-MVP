import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildSoccerVerifyEmail,
  buildVerifyUrl,
  capPreviewLimit,
  getOutreachGuardSecret,
  isValidEmail,
  normalizeOutreachSport,
} from "@/lib/outreach";

type PreviewRequestBody = {
  sport?: string;
  campaign_id?: string;
  limit?: number;
  test_email_override?: string;
};

type TournamentRow = {
  id: string;
  name: string | null;
  sport: string | null;
  tournament_director: string | null;
  tournament_director_email: string | null;
};

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function inferFirstName(value: string | null) {
  const first = (value || "").trim().split(/\s+/).filter(Boolean)[0] || "";
  return first || null;
}

export async function POST(request: NextRequest) {
  if (isProduction()) {
    const headerKey = request.headers.get("X-OUTREACH-KEY") || "";
    const expected = getOutreachGuardSecret();
    if (!expected || headerKey !== expected) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  let body: PreviewRequestBody;
  try {
    body = (await request.json()) as PreviewRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sport = normalizeOutreachSport(body.sport);
  const campaignId = (body.campaign_id || "").trim();
  if (!campaignId) {
    return NextResponse.json({ error: "campaign_id is required." }, { status: 400 });
  }

  const limit = capPreviewLimit(body.limit);
  const emailOverride = (body.test_email_override || "").trim();
  if (emailOverride && !isValidEmail(emailOverride)) {
    return NextResponse.json({ error: "test_email_override must be a valid email." }, { status: 400 });
  }

  const { data, error } = await (supabaseAdmin.from("tournaments" as any) as any)
    .select("id,name,sport,tournament_director,tournament_director_email")
    .eq("sport", sport)
    .not("tournament_director_email", "is", null)
    .neq("tournament_director_email", "")
    .order("start_date", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = ((data ?? []) as TournamentRow[]).filter(
    (row) => row.id && row.name && row.tournament_director_email && isValidEmail(row.tournament_director_email)
  );

  if (rows.length === 0) {
    return NextResponse.json({ created: 0 }, { status: 200 });
  }

  const previews = rows.map((row) => {
    const directorEmail = emailOverride || row.tournament_director_email!.trim();
    const verifyUrl = buildVerifyUrl({
      sport,
      tournamentId: row.id,
      campaignId,
    });
    const email = buildSoccerVerifyEmail({
      firstName: inferFirstName(row.tournament_director),
      verifyUrl,
      tournamentName: row.name,
    });

    return {
      sport,
      campaign_id: campaignId,
      tournament_id: row.id,
      tournament_name: row.name!,
      director_email: directorEmail,
      verify_url: verifyUrl,
      subject: email.subject,
      html_body: email.html,
      text_body: email.text,
      status: "preview",
      error: null,
    };
  });

  const { error: insertError } = await (supabaseAdmin.from("email_outreach_previews" as any) as any).insert(previews);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ created: previews.length }, { status: 200 });
}
