import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  SITE_ORIGIN,
  TOURNAMENT_SITEMAP_PAGE_SIZE,
  buildSitemapXml,
  xmlResponse,
} from "@/lib/sitemaps";

export const revalidate = 3600;

type TournamentSitemapRow = {
  slug: string | null;
  updated_at: string | null;
};

function parseTournamentPage(name: string) {
  const match = /^tournaments-(\d+)\.xml$/i.exec(name);
  if (!match) return null;
  const page = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(page) || page < 1) return null;
  return page;
}

export async function GET(_: Request, { params }: { params: { name: string } }) {
  const page = parseTournamentPage(params.name);
  if (!page) {
    return new NextResponse("Not found", { status: 404 });
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
