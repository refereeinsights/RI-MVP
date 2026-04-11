import { curatedSports, mapStateCodeToSlug, normalizeSportSlug } from "@/lib/seoHub";
import { buildSitemapXml, SITE_ORIGIN, xmlResponse, type SitemapEntry } from "@/lib/sitemaps";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const revalidate = 3600;

type MetroHubUrlRow = {
  sport: string | null;
  state: string | null;
  metro_slug: string | null;
  last_modified: string | null;
};

const MIN_INDEXABLE_UPCOMING = 12;
const ALLOWED_SPORTS = new Set(curatedSports.map((s) => s.key));

export async function GET() {
  let rows: MetroHubUrlRow[] = [];
  try {
    const { data, error } = await supabaseAdmin.rpc("list_indexable_city_metro_hub_urls_v1" as any, {
      p_min_upcoming: MIN_INDEXABLE_UPCOMING,
    });
    if (!error) {
      rows = (Array.isArray(data) ? data : []) as MetroHubUrlRow[];
    }
  } catch {
    rows = [];
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

  return xmlResponse(buildSitemapXml(entries));
}

