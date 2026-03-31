import { preflightEmailSend, type EmailPreflightResult } from "./emailPreflight";
import type { EmailSendKind } from "./emailSuppression";

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

export async function sendEmailWithPreflight(params: {
  kind: EmailSendKind;
  supabaseAdmin?: any;
  allowLocalhostLinks?: boolean;
  payload: EmailPayload;
  sendEmail: (payload: EmailPayload) => Promise<any>;
  resolveFromAndReplyTo: (payload: EmailPayload) => { from: string; replyTo: string };
}): Promise<{ result: any; preflight: EmailPreflightResult }> {
  const { from, replyTo } = params.resolveFromAndReplyTo(params.payload);
  const preflight = await preflightEmailSend({
    kind: params.kind,
    to: params.payload.to,
    subject: params.payload.subject,
    html: params.payload.html,
    text: params.payload.text,
    from,
    replyTo,
    supabaseAdmin: params.supabaseAdmin,
    allowLocalhostLinks: params.allowLocalhostLinks,
  });

  if (preflight.errors.length) {
    throw new Error(preflight.errors[0]);
  }

  const result = await params.sendEmail({
    ...params.payload,
    to: preflight.recipients,
    from,
    replyTo,
  });

  return { result, preflight };
}
