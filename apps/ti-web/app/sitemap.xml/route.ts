import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  SITE_ORIGIN,
  TOURNAMENT_SITEMAP_PAGE_SIZE,
  TOURNAMENT_HOTELS_SITEMAP_PAGE_SIZE,
  VENUE_SITEMAP_PAGE_SIZE,
  buildSitemapIndexXml,
  xmlResponse,
} from "@/lib/sitemaps";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITEMAP_INDEX_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

export async function GET() {
  const sitemapUrls = [
    `${SITE_ORIGIN}/sitemaps/static.xml`,
    `${SITE_ORIGIN}/sitemaps/hubs.xml`,
    `${SITE_ORIGIN}/sitemaps/metros.xml`,
  ];

  const [tournamentResult, tournamentHotelResult, venueResult] = await Promise.all([
    supabaseAdmin
      .from("tournaments_public" as any)
      .select("id", { count: "exact", head: true })
      .not("slug", "is", null),
    (supabaseAdmin as any).rpc("get_tournament_hotels_sitemap_page_v1", {
      p_limit: 1,
      p_offset: 0,
    }),
    supabaseAdmin
      .from("venues" as any)
      .select("id", { count: "exact", head: true })
      .not("seo_slug", "is", null),
  ]);

  const pageCount = Math.ceil((tournamentResult.count ?? 0) / TOURNAMENT_SITEMAP_PAGE_SIZE);
  for (let page = 1; page <= pageCount; page += 1) {
    sitemapUrls.push(`${SITE_ORIGIN}/sitemaps/tournaments-${page}.xml`);
  }

  const tournamentHotelRows = tournamentHotelResult.data;
  const tournamentHotelCount = Number(tournamentHotelRows?.[0]?.total_count ?? 0);
  const tournamentHotelPageCount = Math.ceil(tournamentHotelCount / TOURNAMENT_HOTELS_SITEMAP_PAGE_SIZE);
  for (let page = 1; page <= tournamentHotelPageCount; page += 1) {
    sitemapUrls.push(`${SITE_ORIGIN}/sitemaps/tournament-hotels-${page}.xml`);
  }

  const venuePageCount = Math.ceil((venueResult.count ?? 0) / VENUE_SITEMAP_PAGE_SIZE);
  for (let page = 1; page <= venuePageCount; page += 1) {
    sitemapUrls.push(`${SITE_ORIGIN}/sitemaps/venues-${page}.xml`);
  }

  const response = xmlResponse(buildSitemapIndexXml(sitemapUrls));
  response.headers.set("Cache-Control", SITEMAP_INDEX_CACHE_CONTROL);
  return response;
}
