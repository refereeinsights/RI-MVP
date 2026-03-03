import {
  SITE_ORIGIN,
  STATIC_SITEMAP_PATHS,
  buildSitemapXml,
  xmlResponse,
} from "@/lib/sitemaps";

export const revalidate = 86400;

export async function GET() {
  return xmlResponse(
    buildSitemapXml(
      STATIC_SITEMAP_PATHS.map((path) => ({
        url: `${SITE_ORIGIN}${path}`,
      }))
    )
  );
}
