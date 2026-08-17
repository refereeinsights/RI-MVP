import {
  HUB_SPORT_SLUGS,
  HUB_STATE_PATHS,
  SITE_ORIGIN,
  buildSitemapXml,
  xmlResponse,
} from "@/lib/sitemaps";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=86400";

export async function GET() {
  const entries = [
    ...HUB_SPORT_SLUGS.map((sport) => ({
      url: `${SITE_ORIGIN}/tournaments/hubs/${sport}`,
    })),
    ...HUB_STATE_PATHS.map((path) => ({
      url: `${SITE_ORIGIN}${path}`,
    })),
  ];

  const response = xmlResponse(buildSitemapXml(entries));
  response.headers.set("Cache-Control", CACHE_CONTROL);
  return response;
}
