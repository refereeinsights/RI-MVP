import dns from "node:dns/promises";

// Node/server-only boundary. Client components must consume persisted normalized data,
// never fetch untrusted schedule URLs directly.

export const MAX_SCHEDULE_URL_LENGTH = 2_000;
export const MAX_ICS_RESPONSE_CHARS = 2_000_000;
export const MAX_SCHEDULE_REDIRECTS = 3;
export const SCHEDULE_FETCH_TIMEOUT_MS = 10_000;

export type ScheduleFetchError =
  | "invalid_url"
  | "unsupported_protocol"
  | "private_url"
  | "fetch_failed"
  | "not_ics"
  | "too_large";

export type ScheduleFetchDependencies = {
  fetchImpl?: typeof fetch;
  lookupHost?: (hostname: string) => Promise<Array<{ address: string }>>;
  timeoutMs?: number;
  maxResponseChars?: number;
  maxRedirects?: number;
};

const PRIVATE_HOST_SUFFIXES = [".local"];
const BLOCKED_HOSTS = new Set(["localhost"]);

function ipv4Parts(ip: string) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return null;
  const parts = ip.split(".").map(Number);
  return parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255) ? null : parts;
}

function isPrivateIpv4(ip: string) {
  const parts = ipv4Parts(ip);
  if (!parts) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isPrivateIpv6(ip: string) {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "::" || value === "::1" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) {
    return true;
  }
  const mappedIpv4 = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  return mappedIpv4 ? isPrivateIpv4(mappedIpv4) : false;
}

export function isPrivateScheduleIp(ip: string) {
  return ip.includes(":") ? isPrivateIpv6(ip) : isPrivateIpv4(ip);
}

export function validateScheduleUrl(raw: string) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed || trimmed.length > MAX_SCHEDULE_URL_LENGTH) {
    return { ok: false as const, error: "invalid_url" as const };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false as const, error: "invalid_url" as const };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false as const, error: "unsupported_protocol" as const };
  }
  if (url.username || url.password) return { ok: false as const, error: "invalid_url" as const };

  const hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (!hostname) return { ok: false as const, error: "invalid_url" as const };
  if (
    BLOCKED_HOSTS.has(hostname) ||
    hostname.endsWith(".localhost") ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
    isPrivateScheduleIp(hostname)
  ) {
    return { ok: false as const, error: "private_url" as const };
  }
  return { ok: true as const, url };
}

async function defaultLookupHost(hostname: string) {
  return dns.lookup(hostname, { all: true });
}

async function assertPublicHost(hostname: string, lookupHost: NonNullable<ScheduleFetchDependencies["lookupHost"]>) {
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookupHost(hostname);
  } catch {
    return { ok: false as const, error: "fetch_failed" as const };
  }
  if (!addresses.length) return { ok: false as const, error: "fetch_failed" as const };
  return addresses.some(({ address }) => address && isPrivateScheduleIp(address))
    ? { ok: false as const, error: "private_url" as const }
    : { ok: true as const };
}

function baseContentType(value: string | null) {
  return value?.split(";")[0]?.trim().toLowerCase() || null;
}

export async function fetchIcsSchedule(rawUrl: string | URL, dependencies: ScheduleFetchDependencies = {}) {
  const validated = validateScheduleUrl(rawUrl.toString());
  if (!validated.ok) return validated;

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const lookupHost = dependencies.lookupHost ?? defaultLookupHost;
  const timeoutMs = dependencies.timeoutMs ?? SCHEDULE_FETCH_TIMEOUT_MS;
  const maxResponseChars = dependencies.maxResponseChars ?? MAX_ICS_RESPONSE_CHARS;
  const maxRedirects = dependencies.maxRedirects ?? MAX_SCHEDULE_REDIRECTS;
  let current = validated.url;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const hostCheck = await assertPublicHost(current.hostname, lookupHost);
    if (!hostCheck.ok) return hostCheck;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(current.toString(), { redirect: "manual", signal: controller.signal });
    } catch {
      return { ok: false as const, error: "fetch_failed" as const };
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false as const, error: "fetch_failed" as const };
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return { ok: false as const, error: "fetch_failed" as const };
      }
      const redirect = validateScheduleUrl(next.toString());
      if (!redirect.ok) return redirect;
      current = redirect.url;
      continue;
    }

    const text = await response.text().catch(() => "");
    if (!text) return { ok: false as const, error: "fetch_failed" as const };
    if (text.length > maxResponseChars) return { ok: false as const, error: "too_large" as const };

    const hasCalendar = text.includes("BEGIN:VCALENDAR");
    const contentType = baseContentType(response.headers.get("content-type"));
    const contentTypeAllowed =
      contentType === "text/calendar" ||
      (contentType === "text/plain" && hasCalendar) ||
      (!contentType && hasCalendar);
    if (!hasCalendar || !contentTypeAllowed) return { ok: false as const, error: "not_ics" as const };
    return { ok: true as const, text, finalUrl: current.toString() };
  }

  return { ok: false as const, error: "fetch_failed" as const };
}
