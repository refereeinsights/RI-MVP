function collapseSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeIdentityText(value: string | null | undefined) {
  return collapseSpaces(String(value ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " "));
}

export function normalizeIdentityStreet(value: string | null | undefined) {
  return collapseSpaces(
    String(value ?? "")
      .toLowerCase()
      .replace(/#\s*[a-z0-9-]+\b/g, " ")
      .replace(/\b(apt|apartment|suite|ste|unit|fl|floor)\s*[a-z0-9-]+\b/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+#\s*[a-z0-9-]+\b/g, " ")
      .replace(/\b(street|st)\b/g, "st")
      .replace(/\b(avenue|ave)\b/g, "ave")
      .replace(/\b(road|rd)\b/g, "rd")
      .replace(/\b(boulevard|blvd)\b/g, "blvd")
      .replace(/\b(drive|dr)\b/g, "dr")
      .replace(/\b(lane|ln)\b/g, "ln")
      .replace(/\b(court|ct)\b/g, "ct")
      .replace(/\b(place|pl)\b/g, "pl")
      .replace(/\b(parkway|pkwy)\b/g, "pkwy")
  );
}

export function normalizeIdentityUrlHost(value: string | null | undefined) {
  const input = String(value ?? "").trim();
  if (!input) return "";
  try {
    const parsed = new URL(input.startsWith("http") ? input : `https://${input}`);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return input
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/?#]/)[0]
      .trim();
  }
}

export function buildVenueAddressFingerprint(args: {
  address?: string | null;
  address1?: string | null;
  normalizedAddress?: string | null;
  city?: string | null;
  state?: string | null;
}) {
  const street = normalizeIdentityStreet(args.address1 ?? args.address ?? args.normalizedAddress ?? "");
  const city = normalizeIdentityText(args.city);
  const state = normalizeIdentityText(args.state);
  if (!street || !city || !state) return "";
  return `${street}|${city}|${state}`;
}

export function buildVenueNameCityStateFingerprint(args: {
  name?: string | null;
  city?: string | null;
  state?: string | null;
}) {
  const name = normalizeIdentityText(args.name);
  const city = normalizeIdentityText(args.city);
  const state = normalizeIdentityText(args.state);
  if (!name || !city || !state) return "";
  return `${name}|${city}|${state}`;
}

export function buildTournamentUrlFingerprint(url: string | null | undefined) {
  const input = String(url ?? "").trim();
  if (!input) return "";
  try {
    const normalized = new URL(input.startsWith("http") ? input : `https://${input}`);
    const host = normalized.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = normalized.pathname.replace(/\/+$/, "");
    return `${host}${pathname}` || host;
  } catch {
    return input
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[?#]/)[0]
      .replace(/\/$/, "");
  }
}

export function buildTournamentNameUrlFingerprint(args: {
  name?: string | null;
  officialWebsiteUrl?: string | null;
  sourceUrl?: string | null;
}) {
  const name = normalizeIdentityText(args.name);
  const url = buildTournamentUrlFingerprint(args.officialWebsiteUrl ?? args.sourceUrl ?? "");
  if (!name || !url) return "";
  return `${name}|${url}`;
}

export function buildTournamentNameStateSeasonFingerprint(args: {
  name?: string | null;
  state?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const name = normalizeIdentityText(args.name);
  const state = normalizeIdentityText(args.state);
  const primaryDate = String(args.startDate ?? args.endDate ?? "").trim();
  const season = primaryDate ? primaryDate.slice(0, 4) : "";
  if (!name || !state || !season) return "";
  return `${name}|${state}|${season}`;
}
