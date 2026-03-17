import type { OutreachVariant } from "@/lib/outreach/ab";

type OutreachEmailSport = "soccer" | "baseball" | "softball";

export type VerifyReplyTournament = {
  tournamentId: string;
  tournamentName: string;
  verifyUrl: string;
  startDate?: string | null;
  city?: string | null;
  state?: string | null;
};

type BuildSportDirectorVerifyReplyEmailInput = {
  sport: OutreachEmailSport;
  firstName?: string;
  directorEmail: string;
  tournaments: VerifyReplyTournament[];
  unsubscribeUrl?: string;
  variant: OutreachVariant;
};

type BuildSportDirectorVerifyReplyEmailOutput = {
  subject: string;
  html: string;
  text: string;
};

const EMAIL_LOGO_URL = "https://www.tournamentinsights.com/brand/ti-email-logo-520.png";

export function buildSportDirectorVerifyReplyEmail({
  sport,
  firstName,
  directorEmail,
  tournaments,
  unsubscribeUrl,
  variant,
}: BuildSportDirectorVerifyReplyEmailInput): BuildSportDirectorVerifyReplyEmailOutput {
  const greeting = firstName?.trim() ? `Hi ${escapeHtml(firstName.trim())},` : "Hi,";
  const isUmpireSport = sport === "baseball" || sport === "softball";
  const officialRole = isUmpireSport ? "umpires" : "referees";

  const subject =
    variant === "A"
      ? "Verify your tournament listings"
      : "Verification links for your tournaments";

  const list = tournaments
    .filter((t) => t && t.tournamentName && t.verifyUrl)
    .slice(0, 20);

  const listItemsHtml = list
    .map((t) => {
      const label = escapeHtml(buildTournamentLabel(t));
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
            <div style="font-weight:700;color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.4;">${label}</div>
            <div style="margin-top:6px;">
              <a href="${t.verifyUrl}" style="color:#2563EB;text-decoration:underline;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
                Verify this tournament
              </a>
            </div>
          </td>
        </tr>
      `.trim();
    })
    .join("");

  const unsubscribeBlock = unsubscribeUrl
    ? `
      <tr>
        <td style="padding:0 22px 24px 22px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#64748b;">
          If you'd rather not receive future outreach about these events, you can
          <a href="${unsubscribeUrl}" style="color:#2563EB;text-decoration:underline;">remove them from future campaigns</a>.
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
                  Here are verification links for the tournaments we have listed under <strong>${escapeHtml(directorEmail)}</strong>.
                  Verifying helps keep the listing accurate for teams, families, and ${escapeHtml(officialRole)}.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 22px 6px 22px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  ${listItemsHtml || ""}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 22px 18px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#334155;">
                If any of these are not your events, just reply and tell us which ones to remove.
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
    `Here are verification links for the tournaments we have listed under ${directorEmail}.`,
    `Verifying helps keep the listing accurate for teams, families, and ${isUmpireSport ? "umpires" : "referees"}.`,
    "",
    ...list.map((t) => `${buildTournamentLabel(t)}\n${t.verifyUrl}\n`),
    "",
    "If any of these are not your events, just reply and tell us which ones to remove.",
    "",
    "Rod",
    "support@tournamentinsights.com",
  ];

  if (unsubscribeUrl) {
    textLines.push("", "Prefer not to receive future outreach for these events?", unsubscribeUrl);
  }

  return { subject, html, text: textLines.join("\n") };
}

function buildTournamentLabel(value: VerifyReplyTournament) {
  const name = (value.tournamentName || "").trim() || "Tournament";
  const place = [value.city, value.state].map((v) => (v || "").trim()).filter(Boolean).join(", ");
  const start = formatDateOnly(value.startDate ?? null);

  const chunks = [name];
  if (place) chunks.push(place);
  if (start) chunks.push(`starts ${start}`);
  return chunks.join(" - ");
}

function formatDateOnly(value: string | null) {
  if (!value) return "";
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return value;
  return value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

