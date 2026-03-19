import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildSitemapXml, SITE_ORIGIN, TOURNAMENT_SITEMAP_PAGE_SIZE, xmlResponse, type SitemapEntry } from "@/lib/sitemaps";

export const revalidate = 3600;

function parseTournamentPage(name: string) {
  // Expected: tournaments-<n>.xml (1-indexed)
  const match = /^tournaments-(\d+)\.xml$/i.exec(name);
  if (!match) return null;
  const page = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(page) || page < 1) return null;
  return page;
}

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  const page = parseTournamentPage(params.name);
  if (!page) {
    return new Response("Not found", { status: 404 });
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

