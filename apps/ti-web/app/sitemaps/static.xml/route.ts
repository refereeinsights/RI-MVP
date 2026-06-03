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
  "/privacy",
  "/terms",
  "/tournaments",
  "/venues",
  "/youth-sports-tournaments/june-2026",
] as const;

// TI sport hub routes that exist as `apps/ti-web/app/tournaments/<sport>/page.tsx`.
const SPORT_HUB_SLUGS = ["soccer", "baseball", "softball", "lacrosse", "basketball", "hockey", "ayso"] as const;
const METRO_HUB_SLUGS = [
  "dc-metro",
  "new-england",
  "southern-california",
  "northern-california",
  "texas-triangle",
  "great-lakes",
  "southeast",
  "mountain-west",
  "pacific-northwest",
] as const;

export async function GET() {
  const entries: SitemapEntry[] = [
    ...STATIC_PATHS.map((path) => ({ url: `${SITE_ORIGIN}${path}` })),
    ...SPORT_HUB_SLUGS.map((sport) => ({ url: `${SITE_ORIGIN}/tournaments/${sport}` })),
    ...METRO_HUB_SLUGS.map((slug) => ({ url: `${SITE_ORIGIN}/tournaments/metro/${slug}` })),
  ];

  return xmlResponse(buildSitemapXml(entries));
}
