import { NextResponse } from "next/server";
import {
  SITE_ORIGIN,
  buildSitemapXml,
  sitemapUnavailableResponse,
  xmlResponse,
  type SitemapEntry,
} from "@/lib/sitemaps";
import { getRiTournamentSitemapRows, getRiVenueSitemapRows } from "@/lib/sitemapData";
import { getVenueHref } from "@/lib/venues/getVenueHref";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITEMAP_SHARD_CACHE_CONTROL = "public, s-maxage=21600, stale-while-revalidate=86400";

function cachedXmlResponse(entries: SitemapEntry[]) {
  const response = xmlResponse(buildSitemapXml(entries));
  response.headers.set("Cache-Control", SITEMAP_SHARD_CACHE_CONTROL);
  return response;
}

function parseTournamentPage(name: string) {
  const match = /^tournaments-(\d+)\.xml$/i.exec(name);
  if (!match) return null;
  const page = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(page) || page < 1) return null;
  return page;
}

function parseVenuePage(name: string) {
  const match = /^venues-(\d+)\.xml$/i.exec(name);
  if (!match) return null;
  const page = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(page) || page < 1) return null;
  return page;
}

export async function GET(_: Request, { params }: { params: { name: string } }) {
  const page = parseTournamentPage(params.name);
  const venuePage = page ? null : parseVenuePage(params.name);
  if (!page && !venuePage) {
    if (params.name === "static.xml") {
      const { STATIC_SITEMAP_PATHS } = await import("@/lib/sitemaps");
      return cachedXmlResponse(
        STATIC_SITEMAP_PATHS.map((path) => ({
          url: `${SITE_ORIGIN}${path}`,
        }))
      );
    }
    if (params.name === "hubs.xml") {
      const { HUB_SPORT_SLUGS, HUB_STATE_PATHS } = await import("@/lib/sitemaps");
      return cachedXmlResponse([
        ...HUB_SPORT_SLUGS.map((sport) => ({
          url: `${SITE_ORIGIN}/tournaments/hubs/${sport}`,
        })),
        ...HUB_STATE_PATHS.map((path) => ({
          url: `${SITE_ORIGIN}${path}`,
        })),
      ]);
    }
    return new NextResponse("Not found", { status: 404 });
  }

  if (venuePage) {
    let rows;
    try {
      rows = await getRiVenueSitemapRows(venuePage);
    } catch (error) {
      console.error(`[ri-sitemap] Venue shard ${venuePage} unavailable`, error);
      return sitemapUnavailableResponse();
    }
    return cachedXmlResponse(
      rows
        .filter((row) => row.id)
        .map((row) => ({
          url: `${SITE_ORIGIN}${getVenueHref(row)}`,
          lastModified: row.reviews_last_updated_at,
        }))
    );
  }

  let rows;
  try {
    rows = await getRiTournamentSitemapRows(page);
  } catch (error) {
    console.error(`[ri-sitemap] Tournament shard ${page} unavailable`, error);
    return sitemapUnavailableResponse();
  }
  return cachedXmlResponse(
    rows
      .filter((row) => row.slug)
      .map((row) => ({
        url: `${SITE_ORIGIN}/tournaments/${row.slug}`,
        lastModified: row.updated_at,
      }))
  );
}
