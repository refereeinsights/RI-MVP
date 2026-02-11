import type { AdminListedTournament } from "@/lib/admin";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.refereeinsights.com";

export function buildTournamentUrl(slug: string | null | undefined) {
  if (!slug) return SITE_URL;
  return `${SITE_URL}/tournaments/${slug}`;
}

export function buildColdOutreachEmail(
  tournament: Pick<AdminListedTournament, "name" | "city" | "state" | "slug">,
  contactName?: string | null
) {
  const greeting = contactName ? `Hi ${contactName},` : "Hello,";
  const location = [tournament.city, tournament.state].filter(Boolean).join(", ");
  const listingLine = location
    ? `${tournament.name} (${location})`
    : tournament.name;
  const link = buildTournamentUrl(tournament.slug ?? "");
  const subject = `RefereeInsights listing for ${tournament.name}`;
  const body = `${greeting}\n\nI manage RefereeInsights, a referee-first directory that helps officials evaluate tournaments before accepting assignments. We currently have a public beta listing for ${listingLine}.\n\nIf you’re the right contact, could you confirm or update the listing details here?\n${link}\n\nIf you prefer not to receive future outreach about this listing, reply and I’ll mark this as do-not-contact.\n\nThanks,\nRefereeInsights`;

  return { subject, body };
}

export function buildFollowupEmail(
  tournament: Pick<AdminListedTournament, "name" | "city" | "state" | "slug">,
  contactName?: string | null
) {
  const greeting = contactName ? `Hi ${contactName},` : "Hello,";
  const location = [tournament.city, tournament.state].filter(Boolean).join(", ");
  const listingLine = location
    ? `${tournament.name} (${location})`
    : tournament.name;
  const link = buildTournamentUrl(tournament.slug ?? "");
  const subject = `Follow-up: RefereeInsights listing for ${tournament.name}`;
  const body = `${greeting}\n\nQuick follow-up on the RefereeInsights listing for ${listingLine}. If you can confirm or update the details, the listing is here:\n${link}\n\nIf you prefer not to receive future outreach about this listing, reply and I’ll mark this as do-not-contact.\n\nThanks,\nRefereeInsights`;

  return { subject, body };
}
