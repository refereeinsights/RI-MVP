import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { getTiOutreachAdminUser } from "@/lib/outreachAdmin";
import { getOutreachGuardSecret, isValidEmail } from "@/lib/outreach";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SendDirectorBody = {
  preview_ids?: string[];
};

type PreviewRow = {
  id: string;
  subject: string;
  html_body: string;
  text_body: string;
  director_email: string;
  tournament_id: string | null;
};

type SuppressionRow = {
  tournament_id: string;
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
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: SendDirectorBody;
  try {
    body = (await request.json()) as SendDirectorBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const ids = Array.from(new Set((body.preview_ids || []).map((value) => value.trim()).filter(Boolean)));
  if (ids.length === 0) {
    return NextResponse.json({ error: "preview_ids is required." }, { status: 400 });
  }

  const { data, error } = await (supabaseAdmin.from("email_outreach_previews" as any) as any)
    .select("id,subject,html_body,text_body,director_email,tournament_id")
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const previews = (data ?? []) as PreviewRow[];
  const tournamentIds = Array.from(new Set(previews.map((row) => row.tournament_id).filter(Boolean))) as string[];
  const suppressed = new Set<string>();

  if (tournamentIds.length > 0) {
    const { data: suppressionData, error: suppressionError } = await (supabaseAdmin.from(
      "email_outreach_suppressions" as any
    ) as any)
      .select("tournament_id")
      .in("tournament_id", tournamentIds);

    if (suppressionError) {
      return NextResponse.json({ error: suppressionError.message }, { status: 500 });
    }

    for (const row of (suppressionData ?? []) as SuppressionRow[]) {
      if (row.tournament_id) suppressed.add(row.tournament_id);
    }
  }

  let sent = 0;
  let skipped = 0;

  for (const preview of previews) {
    const directorEmail = (preview.director_email || "").trim().toLowerCase();
    if (!directorEmail || !isValidEmail(directorEmail)) {
      skipped += 1;
      await (supabaseAdmin.from("email_outreach_previews" as any) as any)
        .update({ status: "error", error: "Invalid director email." })
        .eq("id", preview.id);
      continue;
    }

    if (preview.tournament_id && suppressed.has(preview.tournament_id)) {
      skipped += 1;
      continue;
    }

    try {
      await sendEmail({
        to: directorEmail,
        subject: preview.subject,
        html: preview.html_body,
        text: preview.text_body,
      });

      await (supabaseAdmin.from("email_outreach_previews" as any) as any)
        .update({ status: "sent", error: null })
        .eq("id", preview.id);
      sent += 1;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Unable to send outreach email.";
      await (supabaseAdmin.from("email_outreach_previews" as any) as any)
        .update({ status: "error", error: message })
        .eq("id", preview.id);
      skipped += 1;
    }
  }

  return NextResponse.json({ sent, skipped }, { status: 200 });
}
