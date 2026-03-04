import type { OutreachVariant } from "@/lib/outreach/ab";

type OutreachEmailSport = "soccer" | "baseball" | "softball";

type BuildSoccerDirectorVerifyEmailInput = {
  tournamentName: string;
  firstName?: string;
  verifyUrl: string;
  unsubscribeUrl?: string;
  variant: OutreachVariant;
};

type BuildSportDirectorVerifyEmailInput = BuildSoccerDirectorVerifyEmailInput & {
  sport: OutreachEmailSport;
};

type BuildSoccerDirectorVerifyEmailOutput = {
  subject: string;
  html: string;
  text: string;
};

const EMAIL_LOGO_URL = "https://www.tournamentinsights.com/brand/ti-email-logo-520.png";

export function buildSportDirectorVerifyEmail({
  tournamentName,
  firstName,
  verifyUrl,
  unsubscribeUrl,
  variant,
  sport,
}: BuildSportDirectorVerifyEmailInput): BuildSoccerDirectorVerifyEmailOutput {
  const safeName = tournamentName.trim() || "your tournament";
  const greeting = firstName?.trim() ? `Hi ${escapeHtml(firstName.trim())},` : "Hi,";
  const isUmpireSport = sport === "baseball" || sport === "softball";
  const officialRole = isUmpireSport ? "umpire" : "referee";
  const sportLabel = sport.charAt(0).toUpperCase() + sport.slice(1);
  const subject =
    variant === "A"
      ? "Quick favor – can you confirm your tournament details?"
      : "Please verify your tournament listing (2–5 min)";

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
                  We currently have <strong>${escapeHtml(safeName)}</strong> listed on TournamentInsights, but it’s marked unverified.
                </p>
                <p style="margin:0 0 16px 0;">
                  If you have 2–5 minutes, would you mind taking a quick look and confirming the details?
                </p>
                <p style="margin:0 0 10px 0;">It helps us keep the listing useful for teams, families, and officials:</p>
                <ul style="margin:0 0 18px 20px;padding:0;color:#0f172a;">
                  <li style="margin:0 0 8px 0;">Staff Verified badge</li>
                  <li style="margin:0 0 8px 0;">Improves how it appears in ${escapeHtml(sport)} searches</li>
                  <li style="margin:0 0 8px 0;">Clear ${escapeHtml(officialRole)} info (pay, lodging, mentors)</li>
                  <li style="margin:0 0 8px 0;">Highlight official hotel/sponsor links</li>
                </ul>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 22px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 12px 0;">
                  <tr>
                    <td align="center" bgcolor="#2563EB" style="border-radius:10px;">
                      <a
                        href="${verifyUrl}"
                        style="display:inline-block;padding:12px 18px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;"
                      >
                        Verify your tournament
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 22px 12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#334155;">
                If the button doesn’t work, paste this link into your browser:
                <br />
                <a href="${verifyUrl}" style="color:#2563EB;word-break:break-word;">${verifyUrl}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 22px 18px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#334155;">
                Thanks for everything you do to run these events. We know it’s a lot of work.
              </td>
            </tr>
            <tr>
              <td style="padding:0 22px 18px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#334155;">
                Rod<br />
                <a href="mailto:support@tournamentinsights.com" style="color:#2563EB;">support@tournamentinsights.com</a>
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
    `We currently have ${safeName} listed on TournamentInsights, but it’s marked unverified.`,
    "If you have 2–5 minutes, would you mind taking a quick look and confirming the details?",
    "",
    "It helps us keep the listing useful for teams, families, and officials:",
    "- Staff Verified badge",
    `- Improves how it appears in ${sportLabel.toLowerCase()} searches`,
    `- Clear ${officialRole} info (pay, lodging, mentors)`,
    "- Highlight official hotel/sponsor links",
    "",
    "Verify your tournament:",
    verifyUrl,
    "",
    "If the button doesn’t work, paste that link into your browser.",
    "",
    "Thanks for everything you do to run these events. We know it’s a lot of work.",
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

export function buildSoccerDirectorVerifyEmail(input: BuildSoccerDirectorVerifyEmailInput): BuildSoccerDirectorVerifyEmailOutput {
  return buildSportDirectorVerifyEmail({ ...input, sport: "soccer" });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
