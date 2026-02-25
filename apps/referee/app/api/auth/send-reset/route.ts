import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

type Body = { email?: string };
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const IP_LIMIT_PER_WINDOW = 8;
const EMAIL_LIMIT_PER_WINDOW = 3;
const RESET_RATE_LIMIT_KEY = "password_reset_send";
const ANON_USER_ID = "00000000-0000-0000-0000-000000000000";

function normalizeEmail(email?: string) {
  return email?.trim().toLowerCase() || "";
}

function hashValue(value: string) {
  const secret = process.env.CONTACT_ACCESS_HASH_SECRET ?? "local-dev";
  return createHash("sha256").update(`${secret}:${value}`).digest("hex");
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

    const requestHeaders = headers();
    const ipHeader = requestHeaders.get("x-forwarded-for") || requestHeaders.get("x-real-ip") || "unknown";
    const ip = ipHeader.split(",")[0]?.trim() || "unknown";
    const ipHash = hashValue(ip);
    const emailHash = hashValue(email);
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

    const [{ count: ipCount }, { count: emailCount }] = await Promise.all([
      supabaseAdmin
        .from("rate_limit_events" as any)
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .eq("key", RESET_RATE_LIMIT_KEY)
        .gte("created_at", since),
      supabaseAdmin
        .from("rate_limit_events" as any)
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", emailHash)
        .eq("key", `${RESET_RATE_LIMIT_KEY}:email`)
        .gte("created_at", since),
    ]);

    if ((ipCount ?? 0) >= IP_LIMIT_PER_WINDOW || (emailCount ?? 0) >= EMAIL_LIMIT_PER_WINDOW) {
      return NextResponse.json(
        { ok: false, error: "Too many reset requests. Please try again later." },
        { status: 429 }
      );
    }

    await supabaseAdmin.from("rate_limit_events" as any).insert([
      { user_id: ANON_USER_ID, ip_hash: ipHash, key: RESET_RATE_LIMIT_KEY },
      { user_id: ANON_USER_ID, ip_hash: emailHash, key: `${RESET_RATE_LIMIT_KEY}:email` },
    ]);

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
