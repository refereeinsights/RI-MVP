import { createHmac, timingSafeEqual } from "node:crypto";
import type { OutreachVariant } from "@/lib/outreach/ab";
import { buildSportDirectorIntroReplyEmail } from "@/lib/outreach/templates/sportDirectorIntroReply";
import { buildSportDirectorVerifyReplyEmail } from "@/lib/outreach/templates/sportDirectorVerifyReply";
import { buildSportDirectorVerifyEmail } from "@/lib/outreach/templates/soccerDirectorVerify";

const SITE_ORIGIN = process.env.NEXT_PUBLIC_TI_SITE_URL || "https://www.tournamentinsights.com";

export type OutreachSport = "soccer" | "baseball" | "softball";
export type OutreachEmailKind = "verify_link" | "intro_reply";

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

export type SportVerifyEmailInput = SoccerVerifyEmailInput & {
  sport: OutreachSport;
};

export type SportIntroReplyEmailInput = Omit<SoccerVerifyEmailInput, "verifyUrl"> & {
  sport: OutreachSport;
  tournaments?: Array<{
    id: string;
    name: string | null;
    startDate: string | null;
    city: string | null;
    state: string | null;
  }>;
};

export type SportVerifyReplyEmailInput = {
  sport: OutreachSport;
  directorEmail: string;
  firstName?: string | null;
  tournaments: Array<{
    tournamentId: string;
    tournamentName: string;
    verifyUrl: string;
    startDate?: string | null;
    city?: string | null;
    state?: string | null;
  }>;
  unsubscribeUrl?: string;
  variant: OutreachVariant;
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
  return sport === "baseball" || sport === "softball" || sport === "soccer" ? sport : "soccer";
}

export function normalizeOutreachEmailKind(input: string | null | undefined): OutreachEmailKind {
  const kind = (input || "").trim().toLowerCase();
  return kind === "intro_reply" ? "intro_reply" : "verify_link";
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
  tournamentIds,
  directorEmail,
}: {
  sport: OutreachSport;
  tournamentId: string;
  tournamentIds?: string[];
  directorEmail: string;
}) {
  const normalizedIds = Array.from(
    new Set([tournamentId, ...(tournamentIds ?? [])].map((value) => String(value || "").trim()).filter(Boolean))
  ).sort();
  const payload = JSON.stringify({
    sport,
    tournamentIds: normalizedIds,
    directorEmail: directorEmail.trim().toLowerCase(),
  });
  const token = signPayload(payload);

  const url = new URL("/unsubscribe-outreach", SITE_ORIGIN);
  url.searchParams.set("sport", sport);
  if (normalizedIds.length === 1) {
    url.searchParams.set("tournamentId", normalizedIds[0]);
  } else {
    url.searchParams.set("tournamentIds", normalizedIds.join(","));
  }
  url.searchParams.set("email", directorEmail.trim().toLowerCase());
  url.searchParams.set("token", token);
  return url.toString();
}

export function verifyOutreachUnsubscribeToken({
  sport,
  tournamentId,
  tournamentIds,
  directorEmail,
  token,
}: {
  sport: string;
  tournamentId: string;
  tournamentIds?: string[];
  directorEmail: string;
  token: string;
}) {
  const normalizedIds = Array.from(
    new Set([tournamentId, ...(tournamentIds ?? [])].map((value) => String(value || "").trim()).filter(Boolean))
  ).sort();
  const payload = JSON.stringify({
    sport: normalizeOutreachSport(sport),
    tournamentIds: normalizedIds,
    directorEmail: directorEmail.trim().toLowerCase(),
  });
  const expected = signPayload(payload);

  try {
    const providedBytes = Uint8Array.from(Buffer.from(token));
    const expectedBytes = Uint8Array.from(Buffer.from(expected));
    return timingSafeEqual(providedBytes, expectedBytes);
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
  return buildSportVerifyEmail({
    sport: "soccer",
    firstName,
    verifyUrl,
    unsubscribeUrl,
    tournamentName,
    variant,
  });
}

export function buildSportVerifyEmail({
  sport,
  firstName,
  verifyUrl,
  unsubscribeUrl,
  tournamentName,
  variant,
}: SportVerifyEmailInput): SoccerVerifyEmailOutput {
  return buildSportDirectorVerifyEmail({
    sport,
    firstName: firstName ?? undefined,
    verifyUrl,
    unsubscribeUrl,
    tournamentName: tournamentName ?? "",
    variant,
  });
}

export function buildSportIntroReplyEmail({
  sport,
  firstName,
  unsubscribeUrl,
  tournamentName,
  tournaments,
  variant,
}: SportIntroReplyEmailInput): SoccerVerifyEmailOutput {
  return buildSportDirectorIntroReplyEmail({
    sport,
    firstName: firstName ?? undefined,
    unsubscribeUrl,
    tournamentName: tournamentName ?? "",
    tournaments,
    variant,
  });
}

export function buildSportVerifyReplyEmail({
  sport,
  directorEmail,
  firstName,
  tournaments,
  unsubscribeUrl,
  variant,
}: SportVerifyReplyEmailInput): SoccerVerifyEmailOutput {
  return buildSportDirectorVerifyReplyEmail({
    sport,
    directorEmail,
    firstName: firstName ?? undefined,
    tournaments,
    unsubscribeUrl,
    variant,
  });
}
