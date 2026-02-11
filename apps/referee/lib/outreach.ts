import type { AdminListedTournament } from "@/lib/admin";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.refereeinsights.com";
const DEFAULT_SENDER_NAME = process.env.OUTREACH_SENDER_NAME ?? "RefereeInsights";
const DEFAULT_SENDER_EMAIL = process.env.OUTREACH_SENDER_EMAIL ?? "info@refereeinsights.com";

export const DEFAULT_TEMPLATES = {
  tournament_initial: {
    key: "tournament_initial",
    name: "Tournament initial outreach",
    subject_template: "Quick verification for {{tournament_name}}",
    body_template:
      "Hi {{first_name_or_there}},\n\nAs a tournament director, I always struggled to secure strong referees — especially for the most important games late in the weekend. As a referee, I often asked myself a different question: “Is this tournament worth my weekend?”\n\nWe built RefereeInsights to help solve both.\n\nWe’ve created a listing for {{tournament_name}}{{city_state_parens}} based on publicly available information. We’re inviting directors to verify key operational details (pay approach, check-in process, scheduling, hospitality/logistics) so referees have accurate information before committing.\n\nVerified events receive a “Tournament Staff Verified” badge indicating that operational details were confirmed by authorized staff. There’s no cost — the form takes about five minutes.\n\nWould you be open to reviewing the listing?\n\n{{tournament_url}}\n\nIf you prefer not to receive future outreach about this listing, just reply and I’ll mark this as do-not-contact.\n\nBest,\n{{sender_name}}\nRefereeInsights\n{{sender_email}}",
  },
  tournament_followup: {
    key: "tournament_followup",
    name: "Tournament follow-up outreach",
    subject_template: "Re: {{tournament_name}} verification",
    body_template:
      "Hi {{first_name_or_there}},\n\nJust bumping this in case it got buried. Happy to send the quick 5-minute verification form if helpful.\n\nListing:\n{{tournament_url}}\n\nIf you'd prefer not to receive outreach about this listing, just let me know.\n\nBest,\n{{sender_name}}",
  },
} as const;

export function buildTournamentUrl(slug: string | null | undefined) {
  if (!slug) return SITE_URL;
  return `${SITE_URL}/tournaments/${slug}`;
}

export function renderOutreachTemplate(
  template: { subject_template: string; body_template: string },
  tournament: Pick<AdminListedTournament, "name" | "city" | "state" | "slug">,
  contactName?: string | null
) {
  const tournamentName = tournament.name ?? "Tournament";
  const city = (tournament.city ?? "").trim();
  const state = (tournament.state ?? "").trim();
  const cityState = [city, state].filter(Boolean).join(", ");
  const cityStateParens = cityState ? ` (${cityState})` : "";
  const firstName =
    contactName && contactName.trim().length
      ? contactName.trim().split(/\s+/)[0]
      : "there";
  const replacements: Record<string, string> = {
    "{{tournament_name}}": tournamentName,
    "{{tournament_url}}": buildTournamentUrl(tournament.slug ?? ""),
    "{{city_state_parens}}": cityStateParens,
    "{{first_name_or_there}}": firstName,
    "{{sender_name}}": DEFAULT_SENDER_NAME,
    "{{sender_email}}": DEFAULT_SENDER_EMAIL,
  };

  const apply = (text: string) =>
    Object.entries(replacements).reduce(
      (acc, [token, value]) => acc.split(token).join(value ?? ""),
      text
    );

  return {
    subject: apply(template.subject_template),
    body: apply(template.body_template),
  };
}
