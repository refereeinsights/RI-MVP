export type TeamHotelAcquisitionContext = {
  trafficSource: string;
  referrer: string | null;
};

const SEARCH_HOST_SUFFIXES = [
  "google.com",
  "bing.com",
  "yahoo.com",
  "duckduckgo.com",
  "ecosia.org",
  "search.brave.com",
] as const;

function parseHttpUrl(value: string | null | undefined, base?: string) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  try {
    const parsed = base ? new URL(text, base) : new URL(text);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeUtmSource(value: string | null) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 56);
  return normalized || null;
}

function isSearchHostname(hostname: string) {
  return SEARCH_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

function isTournamentInsightsHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "tournamentinsights.com" || normalized.endsWith(".tournamentinsights.com");
}

export function deriveTeamHotelAcquisitionContext(args: {
  pageUrl: string;
  referrer?: string | null;
  siteOrigin: string;
}): TeamHotelAcquisitionContext {
  const siteUrl = parseHttpUrl(args.siteOrigin);
  const pageUrl = parseHttpUrl(args.pageUrl, siteUrl?.origin);
  const referrerUrl = parseHttpUrl(args.referrer);
  const utmSource = normalizeUtmSource(pageUrl?.searchParams.get("utm_source") ?? null);

  const externalReferrer = referrerUrl && siteUrl
    ? isTournamentInsightsHostname(referrerUrl.hostname) && isTournamentInsightsHostname(siteUrl.hostname)
      ? null
      : referrerUrl.hostname.toLowerCase() === siteUrl.hostname.toLowerCase()
        ? null
        : referrerUrl
    : null;

  if (utmSource) {
    return {
      trafficSource: `utm:${utmSource}`,
      referrer: externalReferrer?.origin ?? null,
    };
  }

  if (!referrerUrl) {
    return { trafficSource: "direct", referrer: null };
  }

  if (!externalReferrer) {
    return { trafficSource: "internal", referrer: null };
  }

  return {
    trafficSource: isSearchHostname(externalReferrer.hostname.toLowerCase()) ? "organic_search" : "referral",
    referrer: externalReferrer.origin,
  };
}
