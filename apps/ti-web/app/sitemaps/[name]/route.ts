import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildSitemapXml,
  SITE_ORIGIN,
  TOURNAMENT_SITEMAP_PAGE_SIZE,
  VENUE_SITEMAP_PAGE_SIZE,
  xmlResponse,
  type SitemapEntry,
} from "@/lib/sitemaps";
import { getVenueHref } from "@/lib/venues/getVenueHref";

export const revalidate = 3600;

function parsePagedSitemapName(name: string, prefix: string) {
  const match = new RegExp(`^${prefix}-(\\d+)\\.xml$`, "i").exec(name);
  if (!match) return null;
  const page = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(page) || page < 1) return null;
  return page;
}

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  const tournamentPage = parsePagedSitemapName(params.name, "tournaments");
  if (tournamentPage) {
    const from = (tournamentPage - 1) * TOURNAMENT_SITEMAP_PAGE_SIZE;
    const to = from + TOURNAMENT_SITEMAP_PAGE_SIZE - 1;

    const { data, error } = await supabaseAdmin
      .from("tournaments_public" as any)
      .select("slug,updated_at")
      .not("slug", "is", null)
      .order("slug", { ascending: true })
      .range(from, to);

    if (error) {
      return new Response("Sitemap unavailable", { status: 503 });
    }

    const entries: SitemapEntry[] = (data ?? [])
      .filter((row: any) => row?.slug)
      .map((row: any) => ({
        url: `${SITE_ORIGIN}/tournaments/${row.slug}`,
        lastModified: row.updated_at ?? null,
      }));

    return xmlResponse(buildSitemapXml(entries));
  }

  const venuePage = parsePagedSitemapName(params.name, "venues");
  if (venuePage) {
    const from = (venuePage - 1) * VENUE_SITEMAP_PAGE_SIZE;
    const to = from + VENUE_SITEMAP_PAGE_SIZE - 1;

    const { data, error } = await supabaseAdmin
      .from("venues" as any)
      .select("id,seo_slug")
      .not("seo_slug", "is", null)
      .order("seo_slug", { ascending: true })
      .range(from, to);

    if (error) {
      return new Response("Sitemap unavailable", { status: 503 });
    }

    const entries: SitemapEntry[] = (data ?? [])
      .filter((row: any) => row?.id && row?.seo_slug)
      .map((row: any) => ({
        url: `${SITE_ORIGIN}${getVenueHref({ id: row.id, seo_slug: row.seo_slug })}`,
      }));

    return xmlResponse(buildSitemapXml(entries));
  }

  return new Response("Not found", { status: 404 });
}
