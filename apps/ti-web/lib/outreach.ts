import { createHmac, timingSafeEqual } from "node:crypto";
import type { OutreachVariant } from "@/lib/outreach/ab";
import { buildSoccerDirectorVerifyEmail } from "@/lib/outreach/templates/soccerDirectorVerify";

const SITE_ORIGIN = process.env.NEXT_PUBLIC_TI_SITE_URL || "https://www.tournamentinsights.com";

export type OutreachSport = "soccer";

export type SoccerVerifyEmailInput = {
  firstName?: string | null;
  verifyUrl: string;
  unsubscribeUrl: string;
  tournamentName?: string | null;
  variant: OutreachVariant;
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
  variant,
}: {
  sport: OutreachSport;
  tournamentId: string;
  campaignId: string;
  variant: OutreachVariant;
}) {
  const url = new URL("/verify-your-tournament", SITE_ORIGIN);
  url.searchParams.set("sport", sport);
  url.searchParams.set("tournamentId", tournamentId);
  url.searchParams.set("ab", variant);
  url.searchParams.set("utm_source", "outreach");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", campaignId);
  url.searchParams.set("utm_content", "verify_link");
  url.searchParams.set("utm_term", variant);
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
  variant,
}: SoccerVerifyEmailInput): SoccerVerifyEmailOutput {
  return buildSoccerDirectorVerifyEmail({
    firstName: firstName ?? undefined,
    verifyUrl,
    unsubscribeUrl,
    tournamentName: tournamentName ?? "",
    variant,
  });
}
