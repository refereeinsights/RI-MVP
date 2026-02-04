const TRACKING_PARAM_KEYS = new Set(["gclid", "fbclid", "mc_cid", "mc_eid"]);

export function normalizeSourceUrl(raw: string): { canonical: string; host: string; normalized: string } {
  const trimmed = raw.trim();
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProto);
  url.hash = "";

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  url.hostname = host;

  const params = url.searchParams;
  for (const key of Array.from(params.keys())) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || TRACKING_PARAM_KEYS.has(lower)) {
      params.delete(key);
    }
  }
  url.search = params.toString();

  const canonical = url.toString();
  return { canonical, host, normalized: canonical };
}
