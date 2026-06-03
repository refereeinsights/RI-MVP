import { buildSitemapXml, SITE_ORIGIN, xmlResponse, type SitemapEntry } from "@/lib/sitemaps";

export const revalidate = 3600;

const STATIC_PATHS = [
  "/",
  "/about",
  "/book-travel",
  "/content-standards",
  "/disclaimer",
  "/heatmap",
  "/how-it-works",
  "/list-your-tournament",
  "/premium",
  "/pricing",
  "/privacy",
  "/terms",
  "/tournaments",
  "/venues",
  "/youth-sports-tournaments/june-2026",
] as const;

// TI sport hub routes that exist as `apps/ti-web/app/tournaments/<sport>/page.tsx`.
const SPORT_HUB_SLUGS = ["soccer", "baseball", "softball", "lacrosse", "basketball", "hockey", "ayso"] as const;

export async function GET() {
  const entries: SitemapEntry[] = [
    ...STATIC_PATHS.map((path) => ({ url: `${SITE_ORIGIN}${path}` })),
    ...SPORT_HUB_SLUGS.map((sport) => ({ url: `${SITE_ORIGIN}/tournaments/${sport}` })),
  ];

  return xmlResponse(buildSitemapXml(entries));
}
