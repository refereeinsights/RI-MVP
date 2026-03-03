import {
  HUB_SPORT_SLUGS,
  HUB_STATE_PATHS,
  SITE_ORIGIN,
  buildSitemapXml,
  xmlResponse,
} from "@/lib/sitemaps";

export const revalidate = 86400;

export async function GET() {
  const entries = [
    ...HUB_SPORT_SLUGS.map((sport) => ({
      url: `${SITE_ORIGIN}/tournaments/hubs/${sport}`,
    })),
    ...HUB_STATE_PATHS.map((path) => ({
      url: `${SITE_ORIGIN}${path}`,
    })),
  ];

  return xmlResponse(buildSitemapXml(entries));
}
