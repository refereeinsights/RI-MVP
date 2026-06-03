import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  SITE_ORIGIN,
  TOURNAMENT_SITEMAP_PAGE_SIZE,
  VENUE_SITEMAP_PAGE_SIZE,
  buildSitemapIndexXml,
  xmlResponse,
} from "@/lib/sitemaps";

export const revalidate = 3600;

export async function GET() {
  const sitemapUrls = [
    `${SITE_ORIGIN}/sitemaps/static.xml`,
    `${SITE_ORIGIN}/sitemaps/hubs.xml`,
    `${SITE_ORIGIN}/sitemaps/metros.xml`,
  ];

  const { count } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("id", { count: "exact", head: true })
    .not("slug", "is", null);

  const pageCount = Math.ceil((count ?? 0) / TOURNAMENT_SITEMAP_PAGE_SIZE);
  for (let page = 1; page <= pageCount; page += 1) {
    sitemapUrls.push(`${SITE_ORIGIN}/sitemaps/tournaments-${page}.xml`);
  }

  const { count: venueCount } = await supabaseAdmin
    .from("venues" as any)
    .select("id", { count: "exact", head: true })
    .not("seo_slug", "is", null);

  const venuePageCount = Math.ceil((venueCount ?? 0) / VENUE_SITEMAP_PAGE_SIZE);
  for (let page = 1; page <= venuePageCount; page += 1) {
    sitemapUrls.push(`${SITE_ORIGIN}/sitemaps/venues-${page}.xml`);
  }

  return xmlResponse(buildSitemapIndexXml(sitemapUrls));
}
