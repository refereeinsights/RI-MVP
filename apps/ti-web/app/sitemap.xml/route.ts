import {
  SITE_ORIGIN,
  TOURNAMENT_SITEMAP_PAGE_SIZE,
  TOURNAMENT_HOTELS_SITEMAP_PAGE_SIZE,
  VENUE_SITEMAP_PAGE_SIZE,
  buildSitemapIndexXml,
  sitemapUnavailableResponse,
  xmlResponse,
} from "@/lib/sitemaps";
import { getTiSitemapIndexCounts } from "@/lib/sitemapData";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITEMAP_INDEX_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

export async function GET() {
  const sitemapUrls = [
    `${SITE_ORIGIN}/sitemaps/static.xml`,
    `${SITE_ORIGIN}/sitemaps/hubs.xml`,
    `${SITE_ORIGIN}/sitemaps/metros.xml`,
  ];

  let counts;
  try {
    counts = await getTiSitemapIndexCounts();
  } catch (error) {
    console.error("[ti-sitemap-index] Required sitemap data request threw", error);
    return sitemapUnavailableResponse();
  }

  const pageCount = Math.ceil(counts.tournamentCount / TOURNAMENT_SITEMAP_PAGE_SIZE);
  for (let page = 1; page <= pageCount; page += 1) {
    sitemapUrls.push(`${SITE_ORIGIN}/sitemaps/tournaments-${page}.xml`);
  }

  const tournamentHotelPageCount = Math.ceil(counts.tournamentHotelCount / TOURNAMENT_HOTELS_SITEMAP_PAGE_SIZE);
  for (let page = 1; page <= tournamentHotelPageCount; page += 1) {
    sitemapUrls.push(`${SITE_ORIGIN}/sitemaps/tournament-hotels-${page}.xml`);
  }

  const venuePageCount = Math.ceil(counts.venueCount / VENUE_SITEMAP_PAGE_SIZE);
  for (let page = 1; page <= venuePageCount; page += 1) {
    sitemapUrls.push(`${SITE_ORIGIN}/sitemaps/venues-${page}.xml`);
  }

  // Venue-hotel pilot: single shard covering the top-75 cohort
  sitemapUrls.push(`${SITE_ORIGIN}/sitemaps/venue-hotels-1.xml`);

  const response = xmlResponse(buildSitemapIndexXml(sitemapUrls));
  response.headers.set("Cache-Control", SITEMAP_INDEX_CACHE_CONTROL);
  return response;
}
