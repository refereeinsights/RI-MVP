import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { EmailSendKind } from "../../../shared/email/emailSuppression";
import { sendEmailWithPreflight } from "../../../shared/email/sendWithPreflight";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

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

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text ?? "",
      reply_to: replyTo,
      headers: payload.headers ?? undefined,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(errorBody || `Failed to send email (${response.status}).`);
  }

  return response.json().catch(() => ({}));
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
