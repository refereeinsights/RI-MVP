import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  SITE_ORIGIN,
  TOURNAMENT_SITEMAP_PAGE_SIZE,
  VENUE_SITEMAP_PAGE_SIZE,
  buildSitemapXml,
  xmlResponse,
} from "@/lib/sitemaps";
import { getVenueHref } from "@/lib/venues/getVenueHref";

export const revalidate = 3600;

type TournamentSitemapRow = {
  slug: string | null;
  updated_at: string | null;
};

type VenueSitemapRow = {
  id: string;
  seo_slug: string | null;
  reviews_last_updated_at: string | null;
};

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
      return xmlResponse(
        buildSitemapXml(
          STATIC_SITEMAP_PATHS.map((path) => ({
            url: `${SITE_ORIGIN}${path}`,
          }))
        )
      );
    }
    if (params.name === "hubs.xml") {
      const { HUB_SPORT_SLUGS, HUB_STATE_PATHS } = await import("@/lib/sitemaps");
      return xmlResponse(
        buildSitemapXml([
          ...HUB_SPORT_SLUGS.map((sport) => ({
            url: `${SITE_ORIGIN}/tournaments/hubs/${sport}`,
          })),
          ...HUB_STATE_PATHS.map((path) => ({
            url: `${SITE_ORIGIN}${path}`,
          })),
        ])
      );
    }
    return new NextResponse("Not found", { status: 404 });
  }

  if (venuePage) {
    const from = (venuePage - 1) * VENUE_SITEMAP_PAGE_SIZE;
    const to = from + VENUE_SITEMAP_PAGE_SIZE - 1;

    const { data, error } = await supabaseAdmin
      .from("venues" as any)
      .select("id,seo_slug,reviews_last_updated_at")
      .not("name", "is", null)
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to load venue sitemap page ${venuePage}: ${error.message}`);
    }

    const rows = (data ?? []) as VenueSitemapRow[];
    if (!rows.length) {
      return new NextResponse("Not found", { status: 404 });
    }

    return xmlResponse(
      buildSitemapXml(
        rows
          .filter((row) => row.id)
          .map((row) => ({
            url: `${SITE_ORIGIN}${getVenueHref(row)}`,
            lastModified: row.reviews_last_updated_at,
          }))
      )
    );
  }

  const from = (page - 1) * TOURNAMENT_SITEMAP_PAGE_SIZE;
  const to = from + TOURNAMENT_SITEMAP_PAGE_SIZE - 1;

  const { data, error } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("slug,updated_at")
    .not("slug", "is", null)
    .order("slug", { ascending: true })
    .range(from, to);

  if (error) {
    throw new Error(`Failed to load tournament sitemap page ${page}: ${error.message}`);
  }

  const rows = (data ?? []) as TournamentSitemapRow[];
  if (!rows.length) {
    return new NextResponse("Not found", { status: 404 });
  }

  return xmlResponse(
    buildSitemapXml(
      rows
        .filter((row) => row.slug)
        .map((row) => ({
          url: `${SITE_ORIGIN}/tournaments/${row.slug}`,
          lastModified: row.updated_at,
        }))
    )
  );
}
