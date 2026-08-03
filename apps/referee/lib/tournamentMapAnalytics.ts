type PayloadInput = {
  sourcePage: string | null;
  mapListState: string;
  resultCount: number;
  sport: string | null;
  state: string | null;
  city: string | null;
  month: string | null;
  tournamentId?: string | null;
  tournamentSlug?: string | null;
  venueId?: string | null;
};

export function getRiMapDeviceType(viewportWidth: number) {
  if (viewportWidth < 768) return "mobile";
  if (viewportWidth < 1100) return "tablet";
  return "desktop";
}

export function getRiMapTrafficSource(currentUrl: string, referrer: string) {
  try {
    const url = new URL(currentUrl, "https://www.refereeinsights.com");
    const utmSource = url.searchParams.get("utm_source")?.trim();
    if (utmSource) return utmSource;

    if (!referrer.trim()) return "direct";

    const referrerUrl = new URL(referrer);
    if (/google\./i.test(referrerUrl.hostname) || /bing\.com/i.test(referrerUrl.hostname)) return "organic_search";
    if (referrerUrl.hostname.endsWith("refereeinsights.com")) return "internal";
    return "referral";
  } catch {
    return "unknown";
  }
}

export function buildRiTournamentMapEventPayload(input: PayloadInput) {
  return {
    site: "refereeinsights",
    source_page: input.sourcePage ?? "unknown",
    map_list_state: input.mapListState,
    result_count: input.resultCount,
    sport: input.sport,
    state: input.state,
    city: input.city,
    month: input.month,
    tournament_id: input.tournamentId ?? null,
    tournament_slug: input.tournamentSlug ?? null,
    venue_id: input.venueId ?? null,
  };
}
