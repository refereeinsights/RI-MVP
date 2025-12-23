import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

type Body = { email?: string };

function normalizeEmail(email?: string) {
  return email?.trim().toLowerCase() || "";
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: "Server missing Supabase credentials." },
      { status: 500 }
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (() => {
      try {
        const url = new URL(req.url);
        return `${url.protocol}//${url.host}`;
      } catch {
        return "";
      }
    })();
  const redirectTo = `${origin}/account/reset-password`;

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (error || !data?.properties?.action_link) {
      console.error("generateLink error", error);
      return NextResponse.json(
        { ok: false, error: "Unable to generate reset link right now." },
        { status: 500 }
      );
    }

    const link = data.properties.action_link;
    const from =
      process.env.REVIEW_ALERT_FROM ||
      "Referee Insights <noreply@refereeinsights.com>";

    await sendEmail({
      to: email,
      from,
      subject: "Reset your Referee Insights password",
      html: `
        <div>
          <p>We received a request to reset your Referee Insights password.</p>
          <p><a href="${link}">Reset your password</a></p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `,
      text: `Reset your Referee Insights password: ${link}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("send-reset unexpected error", err);
    return NextResponse.json(
      { ok: false, error: "Unable to send reset email right now." },
      { status: 500 }
    );
  }
}
