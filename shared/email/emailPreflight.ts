import { filterSuppressedRecipients, isPlausibleEmail, type EmailSendKind } from "./emailSuppression";

type EmailRecipient = string | string[];

function normalizeRecipients(to: EmailRecipient): string[] {
  const list = Array.isArray(to) ? to : [to];
  return list.map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean);
}

function extractDomainsFromFromHeader(from: string) {
  // Handles "Name <email@domain>" and "email@domain".
  const match = from.match(/<([^>]+)>/);
  const address = (match?.[1] ?? from).trim();
  const domain = address.split("@")[1]?.trim().toLowerCase() ?? "";
  return { address, domain };
}

function containsLocalhostLink(html: string, text: string) {
  const haystack = `${html}\n${text}`.toLowerCase();
  return (
    haystack.includes("http://localhost") ||
    haystack.includes("https://localhost") ||
    haystack.includes("http://127.0.0.1") ||
    haystack.includes("https://127.0.0.1")
  );
}

export type EmailPreflightResult = {
  recipients: string[];
  suppressed: Array<{ email: string; reason: string | null }>;
  errors: string[];
  warnings: string[];
};

export async function preflightEmailSend(params: {
  kind: EmailSendKind;
  to: EmailRecipient;
  subject: string;
  html: string;
  text?: string;
  from: string;
  replyTo?: string;
  supabaseAdmin?: any;
  allowLocalhostLinks?: boolean;
}): Promise<EmailPreflightResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const subject = params.subject.trim();
  if (!subject) errors.push("Subject is required.");
  if (subject.length > 180) warnings.push("Subject is long (> 180 chars).");

  const recipients = normalizeRecipients(params.to).filter(isPlausibleEmail);
  if (!recipients.length) errors.push("No valid recipients.");
  if (recipients.length > 50) warnings.push("Large recipient list (> 50). Consider batching.");

  const { address: fromAddress, domain: fromDomain } = extractDomainsFromFromHeader(params.from);
  if (!isPlausibleEmail(fromAddress)) errors.push("From address is not a valid email.");
  if (!fromDomain) errors.push("From domain could not be determined.");
  if (fromDomain === "localhost") errors.push("From domain cannot be localhost.");

  const text = params.text ?? "";
  if (!params.allowLocalhostLinks && containsLocalhostLink(params.html, text)) {
    warnings.push("Email content contains localhost links.");
  }

  let suppressed: Array<{ email: string; reason: string | null }> = [];
  let allowed = recipients;

  if (params.supabaseAdmin) {
    try {
      const filtered = await filterSuppressedRecipients({
        supabaseAdmin: params.supabaseAdmin,
        kind: params.kind,
        recipients,
      });
      allowed = filtered.allowed;
      suppressed = filtered.suppressed;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load suppression list.";
      warnings.push(`Suppression check skipped: ${message}`);
    }
  } else {
    warnings.push("Suppression check skipped: no supabaseAdmin provided.");
  }

  if (recipients.length && !allowed.length) {
    errors.push("All recipients are suppressed.");
  }

  return { recipients: allowed, suppressed, errors, warnings };
}

