import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { sendEmail } from "@/lib/email";

type InvitePayload = {
  referee_email?: string;
  referee_name?: string | null;
  tournament_slug?: string | null;
  tournament_id?: string | null;
  note?: string | null;
  source_url?: string | null;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(payload: InvitePayload) {
  if (!payload || typeof payload !== "object") return "Invalid payload.";
  const email = payload.referee_email?.trim();
  if (!email || !EMAIL_REGEX.test(email)) return "Referee email is required and must be valid.";
  if (payload.referee_name && payload.referee_name.length > 200) return "Name is too long.";
  if (payload.note && payload.note.length > 800) return "Note is too long.";
  if (payload.tournament_slug && payload.tournament_slug.length > 120)
    return "Tournament slug is too long.";
  if (payload.tournament_id && payload.tournament_id.length > 200)
    return "Tournament id is too long.";
  if (payload.source_url && payload.source_url.length > 500) return "Source URL is too long.";
  return null;
}

export async function POST(request: Request) {
  let payload: InvitePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const error = validate(payload);
  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, error: "Server missing Supabase credentials." },
      { status: 500 }
    );
  }

  // Try to capture the inviter if logged in.
  let sourceUserId: string | null = null;
  let sourceEmail: string | null = null;
  try {
    const supabaseServer = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();
    if (user) {
      sourceUserId = user.id;
      sourceEmail = user.email ?? null;
    }
  } catch (err) {
    console.error("invite: unable to read session", err);
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: inserted, error: insertError } = await supabase
      .from("review_invites")
      .insert({
        referee_email: payload.referee_email?.trim(),
        referee_name: payload.referee_name?.trim() || null,
        tournament_slug: payload.tournament_slug || null,
        tournament_id: payload.tournament_id || null,
        note: payload.note?.trim() || null,
        source_url: payload.source_url?.trim() || null,
        source_user_id: sourceUserId,
        source_email: sourceEmail,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("invite insert failed", insertError);
      return NextResponse.json(
        { ok: false, error: "Unable to save invite right now." },
        { status: 500 }
      );
    }

    const inviteId = inserted?.id;
    const origin = (() => {
      try {
        const url = new URL(request.url);
        return `${url.protocol}//${url.host}`;
      } catch {
        return process.env.NEXT_PUBLIC_SITE_URL || "";
      }
    })();

    const linkParams = new URLSearchParams();
    if (payload.tournament_slug) linkParams.set("tournament_slug", payload.tournament_slug);
    const inviteLink = `${origin}/reviews/new${linkParams.toString() ? `?${linkParams.toString()}` : ""}`;

    const subject = payload.tournament_slug
      ? `Share insight on ${payload.tournament_slug}`
      : "Share your tournament insight";
    const recipient = payload.referee_email?.trim() as string;
    const refName = payload.referee_name?.trim();

    let sendSucceeded = false;
    try {
      await sendEmail({
        to: recipient,
        subject,
        html: `
          <div>
            <p>${refName ? `${refName},` : "Hi,"}</p>
            <p>You were invited to share referee insight after the event.</p>
            <p>
              <a href="${inviteLink}">Leave your insight</a>
            </p>
            <p>Thanks for helping crews stay informed.</p>
          </div>
        `,
        text: `You were invited to share referee insight. Submit here: ${inviteLink}`,
      });
      sendSucceeded = true;
    } catch (sendErr) {
      console.error("invite email failed", sendErr);
    }

    if (inviteId) {
      await supabase
        .from("review_invites")
        .update({
          status: sendSucceeded ? "sent" : "failed",
          sent_at: sendSucceeded ? new Date().toISOString() : null,
        })
        .eq("id", inviteId);
    }

    return NextResponse.json({ ok: true, status: sendSucceeded ? "sent" : "pending" });
  } catch (err: any) {
    console.error("invite unexpected error", err);
    return NextResponse.json(
      { ok: false, error: "Unable to save invite right now." },
      { status: 500 }
    );
  }
}
