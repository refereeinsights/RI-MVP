import { createHmac, timingSafeEqual } from "node:crypto";

const SITE_ORIGIN = process.env.NEXT_PUBLIC_TI_SITE_URL || "https://www.tournamentinsights.com";

export type OutreachSport = "soccer";

export type SoccerVerifyEmailInput = {
  firstName?: string | null;
  verifyUrl: string;
  unsubscribeUrl: string;
  tournamentName?: string | null;
};

export type SoccerVerifyEmailOutput = {
  subject: string;
  html: string;
  text: string;
};

export function getOutreachMode() {
  return process.env.OUTREACH_MODE === "send" ? "send" : "preview";
}

export function getOutreachSportDefault() {
  return (process.env.OUTREACH_SPORT_DEFAULT || "soccer").trim().toLowerCase();
}

export function capPreviewLimit(limit: unknown) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.min(Math.floor(parsed), 200);
}

export function getOutreachGuardSecret() {
  return process.env.OUTREACH_GENERATOR_KEY || process.env.CRON_SECRET || process.env.VERIFY_LINK_SECRET || "";
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizeOutreachSport(input: string | null | undefined): OutreachSport {
  const sport = (input || getOutreachSportDefault()).trim().toLowerCase();
  return sport === "soccer" ? "soccer" : "soccer";
}

function getVerifyLinkSecret() {
  return process.env.VERIFY_LINK_SECRET || process.env.OUTREACH_GENERATOR_KEY || "local-dev-verify-link-secret";
}

function signPayload(payload: string) {
  return createHmac("sha256", getVerifyLinkSecret()).update(payload).digest("hex");
}

export function buildVerifyUrl({
  sport,
  tournamentId,
  campaignId,
}: {
  sport: OutreachSport;
  tournamentId: string;
  campaignId: string;
}) {
  const url = new URL("/verify-your-tournament", SITE_ORIGIN);
  url.searchParams.set("sport", sport);
  url.searchParams.set("tournamentId", tournamentId);
  url.searchParams.set("utm_source", "outreach");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", campaignId);
  url.searchParams.set("utm_content", "verify_link");
  return url.toString();
}

export function buildOutreachUnsubscribeUrl({
  sport,
  tournamentId,
  directorEmail,
}: {
  sport: OutreachSport;
  tournamentId: string;
  directorEmail: string;
}) {
  const payload = JSON.stringify({
    sport,
    tournamentId,
    directorEmail: directorEmail.trim().toLowerCase(),
  });
  const token = signPayload(payload);

  const url = new URL("/unsubscribe-outreach", SITE_ORIGIN);
  url.searchParams.set("sport", sport);
  url.searchParams.set("tournamentId", tournamentId);
  url.searchParams.set("email", directorEmail.trim().toLowerCase());
  url.searchParams.set("token", token);
  return url.toString();
}

export function verifyOutreachUnsubscribeToken({
  sport,
  tournamentId,
  directorEmail,
  token,
}: {
  sport: string;
  tournamentId: string;
  directorEmail: string;
  token: string;
}) {
  const payload = JSON.stringify({
    sport: normalizeOutreachSport(sport),
    tournamentId,
    directorEmail: directorEmail.trim().toLowerCase(),
  });
  const expected = signPayload(payload);

  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function buildSoccerVerifyEmail({
  firstName,
  verifyUrl,
  unsubscribeUrl,
  tournamentName,
}: SoccerVerifyEmailInput): SoccerVerifyEmailOutput {
  const greeting = firstName?.trim() ? `Hi ${firstName.trim()},` : "Hi there,";
  const safeTournamentName = tournamentName?.trim() || "your tournament";
  const subject = `Please verify your TournamentInsights listing for ${safeTournamentName}`;

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <p>${greeting}</p>
      <p>
        We already have <strong>${escapeHtml(safeTournamentName)}</strong> listed on TournamentInsights.
        A quick review helps us mark the event as <strong>Staff Verified</strong> and improve how it appears in soccer searches.
      </p>
      <p>When you verify, your listing can unlock:</p>
      <ul>
        <li>Staff Verified placement on the event page</li>
        <li>Better visibility in soccer searches</li>
        <li>A clearer referee information panel for pay, lodging, and mentors</li>
        <li>Highlighted official hotel and sponsor links</li>
      </ul>
      <p>
        <a
          href="${verifyUrl}"
          style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: #2563EB; color: #ffffff; text-decoration: none; font-weight: 600;"
        >
          Verify your tournament
        </a>
      </p>
      <p>If the button does not open, use this link:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p style="margin-top: 24px; font-size: 13px; color: #475569;">
        Prefer not to receive future verification outreach for this event?
        <a href="${unsubscribeUrl}"> Remove this tournament from future campaigns</a>.
      </p>
      <p>Thanks,<br />TournamentInsights</p>
    </div>
  `.trim();

  const text = [
    greeting,
    "",
    `We already have ${safeTournamentName} listed on TournamentInsights.`,
    "A quick review helps us mark the event as Staff Verified and improve how it appears in soccer searches.",
    "",
    "When you verify, your listing can unlock:",
    "- Staff Verified placement on the event page",
    "- Better visibility in soccer searches",
    "- A clearer referee information panel for pay, lodging, and mentors",
    "- Highlighted official hotel and sponsor links",
    "",
    `Verify your tournament: ${verifyUrl}`,
    "",
    `Remove this tournament from future campaigns: ${unsubscribeUrl}`,
    "",
    "Thanks,",
    "TournamentInsights",
  ].join("\n");

  return { subject, html, text };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
