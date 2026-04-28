import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { EmailSendKind } from "../../../shared/email/emailSuppression";
import { sendResendEmail } from "../../../shared/email/resendApi";
import { sendEmailWithPreflight } from "../../../shared/email/sendWithPreflight";
import { EXTERNAL_API, EXTERNAL_API_SURFACE, trackExternalCall } from "./trackExternalCall";

type EmailRecipient = string | string[];

type EmailPayload = {
  to: EmailRecipient;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

function normalizeRecipients(to: EmailRecipient): string[] {
  if (Array.isArray(to)) {
    return to.map((value) => value.trim()).filter(Boolean);
  }
  return to.trim() ? [to.trim()] : [];
}

export function resolveFromAndReplyTo(payload: EmailPayload) {
  const from =
    payload.from ??
    process.env.TI_OUTREACH_FROM ??
    "TournamentInsights <hello@mail.tournamentinsights.com>";
  const replyTo =
    payload.replyTo ??
    process.env.EMAIL_REPLY_TO ??
    "hello@tournamentinsights.com";
  return { from, replyTo };
}

export async function sendEmail(payload: EmailPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const to = normalizeRecipients(payload.to);
  if (to.length === 0) {
    throw new Error("No email recipients provided.");
  }

  const { from, replyTo } = resolveFromAndReplyTo(payload);
  return trackExternalCall(EXTERNAL_API.resend, "send_email", EXTERNAL_API_SURFACE.email_transactional, () =>
    sendResendEmail({
      apiKey,
      payload: {
        from,
        to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text ?? "",
        reply_to: replyTo,
        headers: payload.headers ?? undefined,
      },
    })
  );
}

export async function sendEmailVerified(
  payload: EmailPayload & {
    kind?: EmailSendKind;
    allowLocalhostLinks?: boolean;
  }
) {
  return sendEmailWithPreflight({
    kind: payload.kind ?? "transactional",
    supabaseAdmin,
    allowLocalhostLinks: payload.allowLocalhostLinks ?? process.env.NODE_ENV !== "production",
    payload,
    sendEmail,
    resolveFromAndReplyTo,
  });
}
