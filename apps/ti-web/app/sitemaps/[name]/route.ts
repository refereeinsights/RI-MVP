import {
  buildSitemapXml,
  sitemapUnavailableResponse,
  SITE_ORIGIN,
  xmlResponse,
  type SitemapEntry,
} from "@/lib/sitemaps";
import {
  getTiTournamentHotelSitemapRows,
  getTiTournamentSitemapRows,
  getTiVenueSitemapRows,
  getTiVenueHotelSitemapRows,
} from "@/lib/sitemapData";
import { getVenueHref } from "@/lib/venues/getVenueHref";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITEMAP_SHARD_CACHE_CONTROL = "public, s-maxage=21600, stale-while-revalidate=86400";

function cachedXmlResponse(entries: SitemapEntry[]) {
  const response = xmlResponse(buildSitemapXml(entries));
  response.headers.set("Cache-Control", SITEMAP_SHARD_CACHE_CONTROL);
  return response;
}

function parsePagedSitemapName(name: string, prefix: string) {
  const match = new RegExp(`^${prefix}-(\\d+)\\.xml$`, "i").exec(name);
  if (!match) return null;
  const page = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(page) || page < 1) return null;
  return page;
}

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  // Venue-hotel pilot shard (single shard, top-75 cohort)
  const venueHotelsPage = parsePagedSitemapName(params.name, "venue-hotels");
  if (venueHotelsPage === 1) {
    let rows;
    try {
      rows = await getTiVenueHotelSitemapRows();
    } catch (error) {
      console.error("[ti-sitemap] Venue-hotel shard unavailable", error);
      return sitemapUnavailableResponse();
    }
    const entries: SitemapEntry[] = rows.map((row) => ({
      url: `${SITE_ORIGIN}/venues/${encodeURIComponent(row.seo_slug)}/hotels`,
    }));
    return cachedXmlResponse(entries);
  }

  const tournamentHotelsPage = parsePagedSitemapName(params.name, "tournament-hotels");
  if (tournamentHotelsPage) {
    let rows;
    try {
      rows = await getTiTournamentHotelSitemapRows(tournamentHotelsPage);
    } catch (error) {
      console.error(`[ti-sitemap] Tournament hotel shard ${tournamentHotelsPage} unavailable`, error);
      return sitemapUnavailableResponse();
    }
    const entries: SitemapEntry[] = rows
      .filter((row) => Boolean(row.slug))
      .map((row) => ({
        url: `${SITE_ORIGIN}/tournaments/${row.slug}/hotels`,
        lastModified: row.updated_at ?? null,
      }));
    return cachedXmlResponse(entries);
  }

  const tournamentPage = parsePagedSitemapName(params.name, "tournaments");
  if (tournamentPage) {
    let rows;
    try {
      rows = await getTiTournamentSitemapRows(tournamentPage);
    } catch (error) {
      console.error(`[ti-sitemap] Tournament shard ${tournamentPage} unavailable`, error);
      return sitemapUnavailableResponse();
    }
    const entries: SitemapEntry[] = rows
      .filter((row) => row.slug)
      .map((row) => ({
        url: `${SITE_ORIGIN}/tournaments/${row.slug}`,
        lastModified: row.updated_at ?? null,
      }));
    return cachedXmlResponse(entries);
  }

  const venuePage = parsePagedSitemapName(params.name, "venues");
  if (venuePage) {
    let rows;
    try {
      rows = await getTiVenueSitemapRows(venuePage);
    } catch (error) {
      console.error(`[ti-sitemap] Venue shard ${venuePage} unavailable`, error);
      return sitemapUnavailableResponse();
    }
    const entries: SitemapEntry[] = rows.flatMap((row) =>
      row.id && row.seo_slug
        ? [{ url: `${SITE_ORIGIN}${getVenueHref({ id: row.id, seo_slug: row.seo_slug })}` }]
        : []
    );
    return cachedXmlResponse(entries);
  }

  return new Response("Not found", { status: 404 });
}
