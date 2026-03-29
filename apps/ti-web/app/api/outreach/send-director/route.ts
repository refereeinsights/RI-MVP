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
  tournament_ids?: string[] | null;
  send_attempt_count?: number | null;
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      {
        error:
          "Supabase admin client is not configured. Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY in this runtime environment.",
      },
      { status: 500 }
    );
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
    .select("id,subject,html_body,text_body,director_email,tournament_id,tournament_ids,send_attempt_count")
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const previews = (data ?? []) as PreviewRow[];
  const tournamentIds = Array.from(
    new Set(
      previews
        .flatMap((row) => [row.tournament_id, ...(((row.tournament_ids ?? []) as string[]) || [])])
        .map((value) => (value || "").trim())
        .filter(Boolean)
    )
  ) as string[];
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

    const idsForPreview = Array.from(
      new Set(
        [preview.tournament_id, ...(((preview.tournament_ids ?? []) as string[]) || [])]
          .map((value) => (value || "").trim())
          .filter(Boolean)
      )
    );
    if (idsForPreview.length > 0 && idsForPreview.every((id) => suppressed.has(id))) {
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

      const attempt = (preview.send_attempt_count ?? 0) + 1;
      const { error: updateError } = await (supabaseAdmin.from("email_outreach_previews" as any) as any)
        .update({ status: "sent", error: null, sent_at: new Date().toISOString(), send_attempt_count: attempt })
        .eq("id", preview.id);
      if (updateError) {
        const message = typeof updateError?.message === "string" ? updateError.message : String(updateError);
        const normalized = message.toLowerCase();
        const missingColumn =
          normalized.includes("send_attempt_count") &&
          (normalized.includes("does not exist") ||
            normalized.includes("could not find") ||
            normalized.includes("schema cache") ||
            normalized.includes("column"));
        if (missingColumn) {
          return NextResponse.json(
            {
              error:
                "Outreach tracking columns are missing in Supabase. Apply migration `supabase/migrations/20260329_email_outreach_preview_tracking.sql` (then retry).",
            },
            { status: 409 }
          );
        }
        return NextResponse.json({ error: message }, { status: 500 });
      }
      sent += 1;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Unable to send outreach email.";
      try {
        await (supabaseAdmin.from("email_outreach_previews" as any) as any)
          .update({ status: "error", error: message, send_attempt_count: (preview.send_attempt_count ?? 0) + 1 })
          .eq("id", preview.id);
      } catch {
        // Ignore failures updating tracking columns; original send error is still actionable.
      }
      skipped += 1;
    }
  }

  return NextResponse.json({ sent, skipped }, { status: 200 });
}
