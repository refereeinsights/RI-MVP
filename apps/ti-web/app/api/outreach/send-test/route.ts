import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { getTiOutreachAdminUser } from "@/lib/outreachAdmin";
import { getOutreachGuardSecret, isValidEmail } from "@/lib/outreach";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SendTestBody = {
  preview_id?: string;
  email?: string;
};

type PreviewRow = {
  id: string;
  subject: string;
  html_body: string;
  text_body: string;
  send_attempt_count?: number | null;
};

async function authorize(request: NextRequest) {
  const headerKey = request.headers.get("X-OUTREACH-KEY") || "";
  const expected = getOutreachGuardSecret();
  if (expected && headerKey === expected) {
    return { authorized: true, email: "" };
  }

  const user = await getTiOutreachAdminUser();
  return { authorized: !!user, email: user?.email?.trim().toLowerCase() || "" };
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

  let body: SendTestBody;
  try {
    body = (await request.json()) as SendTestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const previewId = (body.preview_id || "").trim();
  const email = (body.email || auth.email || "").trim().toLowerCase();

  if (!previewId) {
    return NextResponse.json({ error: "preview_id is required." }, { status: 400 });
  }
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "A valid target email is required." }, { status: 400 });
  }

  const { data, error } = await (supabaseAdmin.from("email_outreach_previews" as any) as any)
    .select("id,subject,html_body,text_body,send_attempt_count")
    .eq("id", previewId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const preview = data as PreviewRow | null;
  if (!preview) {
    return NextResponse.json({ error: "Preview not found." }, { status: 404 });
  }

  try {
    await sendEmail({
      to: email,
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

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : "Unable to send test email.";
    try {
      await (supabaseAdmin.from("email_outreach_previews" as any) as any)
        .update({ status: "error", error: message, send_attempt_count: (preview.send_attempt_count ?? 0) + 1 })
        .eq("id", preview.id);
    } catch {
      // Ignore failures updating tracking columns; original send error is still actionable.
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
