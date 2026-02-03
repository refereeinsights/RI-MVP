export type AtlasSearchResult = {
  url: string;
  title: string | null;
  snippet: string | null;
  domain: string | null;
};

type Provider = "serpapi" | "bing";

function getProvider(): Provider {
  const raw = (process.env.ATLAS_SEARCH_PROVIDER || "serpapi").toLowerCase();
  return raw === "bing" ? "bing" : "serpapi";
}

function clampLimit(limit: number) {
  if (!Number.isFinite(limit)) return 10;
  return Math.min(50, Math.max(1, Math.floor(limit)));
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export async function atlasSearch(query: string, limit: number): Promise<AtlasSearchResult[]> {
  const provider = getProvider();
  const count = clampLimit(limit);

  if (provider === "bing") {
    const key = process.env.BING_SEARCH_KEY;
    if (!key) throw new Error("BING_SEARCH_KEY missing");
    const url = new URL("https://api.bing.microsoft.com/v7.0/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count));
    url.searchParams.set("responseFilter", "Webpages");
    url.searchParams.set("mkt", "en-US");
    const resp = await fetch(url.toString(), {
      headers: { "Ocp-Apim-Subscription-Key": key },
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Bing search failed: ${resp.status} ${text}`);
    }
    const json = await resp.json();
    const rows = json?.webPages?.value ?? [];
    return rows.map((row: any) => ({
      url: row.url,
      title: row.name ?? null,
      snippet: row.snippet ?? null,
      domain: domainFromUrl(row.url),
    }));
  }

  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error("SERPAPI_API_KEY missing");
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(count));
  url.searchParams.set("api_key", key);
  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`SerpAPI search failed: ${resp.status} ${text}`);
  }
  const json = await resp.json();
  const rows = json?.organic_results ?? [];
  return rows.map((row: any) => ({
    url: row.link,
    title: row.title ?? null,
    snippet: row.snippet ?? null,
    domain: domainFromUrl(row.link),
  }));
}

export function getSearchProviderName() {
  return getProvider();
}
