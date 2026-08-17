import {
  SITE_ORIGIN,
  STATIC_SITEMAP_PATHS,
  buildSitemapXml,
  xmlResponse,
} from "@/lib/sitemaps";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=86400";

export async function GET() {
  const response = xmlResponse(
    buildSitemapXml(
      STATIC_SITEMAP_PATHS.map((path) => ({
        url: `${SITE_ORIGIN}${path}`,
      }))
    )
  );
  response.headers.set("Cache-Control", CACHE_CONTROL);
  return response;
}
