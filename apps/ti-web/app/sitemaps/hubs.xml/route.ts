import { curatedSports, curatedStates } from "@/lib/seoHub";
import { buildSitemapXml, SITE_ORIGIN, xmlResponse, type SitemapEntry } from "@/lib/sitemaps";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=86400";

export async function GET() {
  const entries: SitemapEntry[] = curatedSports.flatMap((sport) =>
    curatedStates.map((state) => ({
      url: `${SITE_ORIGIN}/${sport.slug}/${state.slug}`,
    }))
  );

  const response = xmlResponse(buildSitemapXml(entries));
  response.headers.set("Cache-Control", CACHE_CONTROL);
  return response;
}
