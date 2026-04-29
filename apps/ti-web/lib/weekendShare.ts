const SITE_ORIGIN = process.env.NEXT_PUBLIC_TI_SITE_URL || "https://www.tournamentinsights.com";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export type WeekendShareSourcePage = "tournament_detail" | "venue_map" | "venue_detail" | "weekend_page";

export function buildWeekendShareUrl(args: {
  tournamentSlug: string;
  venue?: string | null; // slug preferred; uuid allowed
  sourcePage: WeekendShareSourcePage;
}) {
  const slug = String(args.tournamentSlug ?? "").trim();
  if (!slug) return `${SITE_ORIGIN}/tournaments`;

  const url = new URL(`/weekend/${encodeURIComponent(slug)}`, SITE_ORIGIN);

  const venueRaw = String(args.venue ?? "").trim();
  if (venueRaw) {
    // Prefer slugs, but allow UUIDs when no slug exists.
    url.searchParams.set("venue", venueRaw);
  }

  url.searchParams.set("utm_source", "share");
  url.searchParams.set("utm_medium", args.sourcePage);
  return url.toString();
}

export function parseVenueParam(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return { kind: "none" as const, value: null };
  return isUuid(raw) ? { kind: "id" as const, value: raw } : { kind: "slug" as const, value: raw };
}

