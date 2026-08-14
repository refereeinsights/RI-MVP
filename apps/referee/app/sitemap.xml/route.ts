import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  SITE_ORIGIN,
  TOURNAMENT_SITEMAP_PAGE_SIZE,
  VENUE_SITEMAP_PAGE_SIZE,
  buildSitemapIndexXml,
  sitemapUnavailableResponse,
  xmlResponse,
} from "@/lib/sitemaps";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITEMAP_INDEX_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

function isValidCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export async function GET() {
  const sitemapUrls = [
    `${SITE_ORIGIN}/sitemaps/static.xml`,
    `${SITE_ORIGIN}/sitemaps/hubs.xml`,
  ];

  let tournamentResult;
  let venueResult;
  try {
    [tournamentResult, venueResult] = await Promise.all([
      supabaseAdmin
        .from("tournaments_public" as any)
        .select("id", { count: "exact", head: true })
        .not("slug", "is", null),
      supabaseAdmin
        .from("venues" as any)
        .select("id", { count: "exact", head: true })
        .not("name", "is", null),
    ]);
  } catch (error) {
    console.error("[ri-sitemap-index] Required sitemap data request threw", error);
    return sitemapUnavailableResponse();
  }

  if (
    tournamentResult.error ||
    venueResult.error ||
    !isValidCount(tournamentResult.count) ||
    !isValidCount(venueResult.count)
  ) {
    console.error("[ri-sitemap-index] Required sitemap data unavailable", {
      tournamentError: tournamentResult.error,
      venueError: venueResult.error,
      tournamentCount: tournamentResult.count,
      venueCount: venueResult.count,
    });
    return sitemapUnavailableResponse();
  }

  const pageCount = Math.ceil(tournamentResult.count / TOURNAMENT_SITEMAP_PAGE_SIZE);
  for (let page = 1; page <= pageCount; page += 1) {
    sitemapUrls.push(`${SITE_ORIGIN}/sitemaps/tournaments-${page}.xml`);
  }

  const venuePageCount = Math.ceil(venueResult.count / VENUE_SITEMAP_PAGE_SIZE);
  for (let page = 1; page <= venuePageCount; page += 1) {
    sitemapUrls.push(`${SITE_ORIGIN}/sitemaps/venues-${page}.xml`);
  }

  const response = xmlResponse(buildSitemapIndexXml(sitemapUrls));
  response.headers.set("Cache-Control", SITEMAP_INDEX_CACHE_CONTROL);
  return response;
}
