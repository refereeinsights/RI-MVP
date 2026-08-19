import { parseVenueHotelUuid, sanitizeText } from "./venueHotelFunnel";

export const HOTEL_DISTRIBUTION_STORAGE_KEY = "ti_hotel_distribution_source_v1";

export const HOTEL_DISTRIBUTION_SOURCES = [
  "director_email",
  "team_manager_email",
  "tournament_website",
  "qr_code",
  "social",
  "other_director",
] as const;

export type HotelDistributionSource = (typeof HOTEL_DISTRIBUTION_SOURCES)[number];

export function isKnownAutomatedHotelUserAgent(value: string | null | undefined) {
  const userAgent = String(value ?? "").trim();
  if (!userAgent) return false;
  return /(bot|spider|crawler|facebookexternalhit|slackbot|discordbot|whatsapp|telegrambot|preview)/i.test(userAgent);
}

export function normalizeHotelDistributionSource(value: unknown): HotelDistributionSource | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return HOTEL_DISTRIBUTION_SOURCES.includes(normalized as HotelDistributionSource)
    ? normalized as HotelDistributionSource
    : null;
}

export function directorHotelTrafficSource(source: HotelDistributionSource | null | undefined) {
  return source ? `director:${source}` : null;
}

export function resolveHotelTrafficSource(input: {
  distributionSource?: unknown;
  existingTrafficSource?: string | null;
}) {
  const distributionSource = normalizeHotelDistributionSource(input.distributionSource);
  return directorHotelTrafficSource(distributionSource)
    ?? sanitizeText(input.existingTrafficSource ?? null, 64);
}

export function normalizeHotelMeasurementProperties(properties: Record<string, unknown>) {
  return {
    session_id: parseVenueHotelUuid(properties.session_id),
    distribution_source: normalizeHotelDistributionSource(properties.distribution_source),
  };
}

export function readOrRememberHotelDistributionSource(): HotelDistributionSource | null {
  if (typeof window === "undefined") return null;
  try {
    const querySource = normalizeHotelDistributionSource(
      new URLSearchParams(window.location.search).get("distribution_source")
    );
    if (querySource) {
      window.sessionStorage.setItem(HOTEL_DISTRIBUTION_STORAGE_KEY, querySource);
      return querySource;
    }
    return normalizeHotelDistributionSource(
      window.sessionStorage.getItem(HOTEL_DISTRIBUTION_STORAGE_KEY)
    );
  } catch {
    return null;
  }
}

export function appendHotelMeasurementParams(
  url: URL,
  input: { sessionId?: string | null; distributionSource?: HotelDistributionSource | null }
) {
  const sessionId = parseVenueHotelUuid(input.sessionId);
  const distributionSource = normalizeHotelDistributionSource(input.distributionSource);
  if (sessionId) url.searchParams.set("session_id", sessionId);
  if (distributionSource) url.searchParams.set("distribution_source", distributionSource);
  return url;
}
