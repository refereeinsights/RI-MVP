import { curatedSports, curatedStates } from "@/lib/seoHub";
import { buildSitemapXml, SITE_ORIGIN, xmlResponse, type SitemapEntry } from "@/lib/sitemaps";

export const revalidate = 3600;

export async function GET() {
  const entries: SitemapEntry[] = curatedSports.flatMap((sport) =>
    curatedStates.map((state) => ({
      url: `${SITE_ORIGIN}/${sport.slug}/${state.slug}`,
    }))
  );

  return xmlResponse(buildSitemapXml(entries));
}

