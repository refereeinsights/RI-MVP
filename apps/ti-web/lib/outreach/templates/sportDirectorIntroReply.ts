import type { OutreachVariant } from "@/lib/outreach/ab";

type OutreachEmailSport = "soccer" | "baseball" | "softball";

type BuildSportDirectorIntroReplyEmailInput = {
  tournamentName: string;
  firstName?: string;
  unsubscribeUrl?: string;
  variant: OutreachVariant;
  sport: OutreachEmailSport;
};

type BuildSportDirectorIntroReplyEmailOutput = {
  subject: string;
  html: string;
  text: string;
};

const EMAIL_LOGO_URL = "https://www.tournamentinsights.com/brand/ti-email-logo-520.png";

export function buildSportDirectorIntroReplyEmail({
  tournamentName,
  firstName,
  unsubscribeUrl,
  variant,
  sport,
}: BuildSportDirectorIntroReplyEmailInput): BuildSportDirectorIntroReplyEmailOutput {
  const safeName = tournamentName.trim() || "your tournament";
  const greeting = firstName?.trim() ? `Hi ${escapeHtml(firstName.trim())},` : "Hi,";
  const isUmpireSport = sport === "baseball" || sport === "softball";
  const officialRole = isUmpireSport ? "umpires" : "referees";

  const subject =
    variant === "A"
      ? "Quick question about your tournament listing"
      : "Can you confirm a few tournament details?";

  const unsubscribeBlock = unsubscribeUrl
    ? `
      <tr>
        <td style="padding:0 22px 24px 22px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#64748b;">
          If you'd rather not receive future outreach about this event, you can
          <a href="${unsubscribeUrl}" style="color:#2563EB;text-decoration:underline;">remove this tournament from future campaigns</a>.
        </td>
      </tr>
    `
    : "";

  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
            <tr>
              <td align="center" style="padding:20px 22px 10px 22px;">
                <img
                  src="${EMAIL_LOGO_URL}"
                  width="260"
                  alt="TournamentInsights"
                  style="display:block;border:0;outline:none;text-decoration:none;height:auto;"
                />
              </td>
            </tr>
            <tr>
              <td style="padding:10px 22px 0 22px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#0f172a;">
                <p style="margin:0 0 16px 0;">${greeting}</p>
                <p style="margin:0 0 16px 0;">
                  We have <strong>${escapeHtml(safeName)}</strong> listed on TournamentInsights and want to make sure the details are accurate for teams, families, and ${escapeHtml(officialRole)}.
                </p>
                <p style="margin:0 0 16px 0;">
                  Could you reply to this email with any corrections (or just reply “Looks good”)?
                </p>
                <p style="margin:0 0 10px 0;">Most helpful items:</p>
                <ul style="margin:0 0 18px 20px;padding:0;color:#0f172a;">
                  <li style="margin:0 0 8px 0;">Official website</li>
                  <li style="margin:0 0 8px 0;">Dates</li>
                  <li style="margin:0 0 8px 0;">City / State</li>
                  <li style="margin:0 0 8px 0;">Venues / facility names</li>
                </ul>
                <p style="margin:0 0 18px 0;">
                  Thanks — we really appreciate it.
                </p>
                <p style="margin:0 0 18px 0;">
                  Rod<br />
                  <a href="mailto:support@tournamentinsights.com" style="color:#2563EB;">support@tournamentinsights.com</a>
                </p>
              </td>
            </tr>
            ${unsubscribeBlock}
          </table>
        </td>
      </tr>
    </table>
  `.trim();

  const textLines = [
    firstName?.trim() ? `Hi ${firstName.trim()},` : "Hi,",
    "",
    `We have ${safeName} listed on TournamentInsights and want to make sure the details are accurate for teams, families, and ${
      isUmpireSport ? "umpires" : "referees"
    }.`,
    "",
    'Could you reply to this email with any corrections (or just reply "Looks good")?',
    "",
    "Most helpful items:",
    "- Official website",
    "- Dates",
    "- City / State",
    "- Venues / facility names",
    "",
    "Thanks — we really appreciate it.",
    "",
    "Rod",
    "support@tournamentinsights.com",
  ];

  if (unsubscribeUrl) {
    textLines.push("", "Prefer not to receive future outreach for this event?", unsubscribeUrl);
  }

  return {
    subject,
    html,
    text: textLines.join("\n"),
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

