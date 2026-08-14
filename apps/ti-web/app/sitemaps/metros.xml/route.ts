import { curatedSports, mapStateCodeToSlug, normalizeSportSlug } from "@/lib/seoHub";
import {
  buildSitemapXml,
  sitemapUnavailableResponse,
  SITE_ORIGIN,
  xmlResponse,
  type SitemapEntry,
} from "@/lib/sitemaps";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITEMAP_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

type MetroHubUrlRow = {
  sport: string | null;
  state: string | null;
  metro_slug: string | null;
  last_modified: string | null;
};

const MIN_INDEXABLE_UPCOMING = 12;
const ALLOWED_SPORTS = new Set(curatedSports.map((s) => s.key));

export async function GET() {
  let rows: MetroHubUrlRow[];
  try {
    const { data, error } = await supabaseAdmin.rpc("list_indexable_city_metro_hub_urls_v1" as any, {
      p_min_upcoming: MIN_INDEXABLE_UPCOMING,
    });
    if (error || !Array.isArray(data)) {
      console.error("[ti-metro-sitemap] Required sitemap data unavailable", {
        error,
        hasArrayData: Array.isArray(data),
      });
      return sitemapUnavailableResponse();
    }
    rows = data as MetroHubUrlRow[];
  } catch (error) {
    console.error("[ti-metro-sitemap] Required sitemap data request threw", error);
    return sitemapUnavailableResponse();
  }

  const entries: SitemapEntry[] = rows
    .map((row) => {
      const sportKey = normalizeSportSlug(String(row.sport ?? ""));
      if (!sportKey || !ALLOWED_SPORTS.has(sportKey)) return null;

      const stateCode = String(row.state ?? "").trim().toUpperCase();
      const stateSlug = mapStateCodeToSlug(stateCode);
      if (!stateSlug) return null;

      const metroSlug = String(row.metro_slug ?? "").trim().toLowerCase();
      if (!metroSlug) return null;

      return {
        url: `${SITE_ORIGIN}/${sportKey}/${stateSlug}/${metroSlug}`,
        lastModified: row.last_modified,
      } satisfies SitemapEntry;
    })
    .filter(Boolean) as SitemapEntry[];

  const response = xmlResponse(buildSitemapXml(entries));
  response.headers.set("Cache-Control", SITEMAP_CACHE_CONTROL);
  return response;
}
