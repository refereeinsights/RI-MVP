import { NextRequest, NextResponse } from "next/server";
import { pickVariant } from "@/lib/outreach/ab";
import { sendEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildSoccerVerifyEmail,
  buildOutreachUnsubscribeUrl,
  buildVerifyUrl,
  capPreviewLimit,
  getOutreachGuardSecret,
  getOutreachMode,
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

type SuppressionRow = {
  tournament_id: string;
};

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function getLocalSendOverride() {
  return process.env.NODE_ENV === "production" ? "" : (process.env.OUTREACH_TEST_RECIPIENT || "").trim().toLowerCase();
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
  const localSendOverride = getLocalSendOverride();
  if (localSendOverride && !isValidEmail(localSendOverride)) {
    return NextResponse.json({ error: "OUTREACH_TEST_RECIPIENT must be a valid email." }, { status: 500 });
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

  const tournamentIds = rows.map((row) => row.id);
  const { data: suppressionData, error: suppressionError } = await (supabaseAdmin.from(
    "email_outreach_suppressions" as any
  ) as any)
    .select("tournament_id")
    .in("tournament_id", tournamentIds);

  if (suppressionError) {
    return NextResponse.json({ error: suppressionError.message }, { status: 500 });
  }

  const suppressedIds = new Set(((suppressionData ?? []) as SuppressionRow[]).map((row) => row.tournament_id));
  const eligibleRows = rows.filter((row) => !suppressedIds.has(row.id));

  if (eligibleRows.length === 0) {
    return NextResponse.json({ created: 0 }, { status: 200 });
  }

  const mode = getOutreachMode();
  const records = [];

  for (const row of eligibleRows) {
    const directorEmail = emailOverride || row.tournament_director_email!.trim();
    const variant = pickVariant(row.id);
    const verifyUrl = buildVerifyUrl({
      sport,
      tournamentId: row.id,
      campaignId,
      variant,
    });
    const unsubscribeUrl = buildOutreachUnsubscribeUrl({
      sport,
      tournamentId: row.id,
      directorEmail,
    });
    const email = buildSoccerVerifyEmail({
      firstName: inferFirstName(row.tournament_director),
      verifyUrl,
      unsubscribeUrl,
      tournamentName: row.name,
      variant,
    });
    const sendRecipient = localSendOverride || directorEmail;
    let status: "preview" | "sent" | "error" = "preview";
    let providerMessageId: string | null = null;
    let sendError: string | null = null;

    if (mode === "send") {
      try {
        const result = (await sendEmail({
          to: sendRecipient,
          subject: email.subject,
          html: email.html,
          text: email.text,
        })) as { id?: string } | undefined;
        status = "sent";
        providerMessageId = result?.id ?? null;
        if (localSendOverride) {
          console.info(
            "[ti-outreach-send-override]",
            JSON.stringify({
              intended_recipient: directorEmail,
              sent_to: localSendOverride,
              tournament_id: row.id,
              campaign_id: campaignId,
            })
          );
        }
      } catch (error) {
        status = "error";
        sendError = error instanceof Error ? error.message : "Unable to send outreach email.";
      }
    }

    records.push({
      sport,
      campaign_id: campaignId,
      variant,
      tournament_id: row.id,
      tournament_name: row.name!,
      director_email: directorEmail,
      verify_url: verifyUrl,
      subject: email.subject,
      html_body: email.html,
      text_body: email.text,
      provider_message_id: providerMessageId,
      status,
      error: sendError,
    });
  }

  const { error: insertError } = await (supabaseAdmin.from("email_outreach_previews" as any) as any).insert(records);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      created: records.length,
      mode,
      sent: records.filter((record) => record.status === "sent").length,
      errored: records.filter((record) => record.status === "error").length,
    },
    { status: 200 }
  );
}
