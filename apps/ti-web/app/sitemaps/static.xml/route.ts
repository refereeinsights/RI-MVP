import { buildSitemapXml, SITE_ORIGIN, xmlResponse, type SitemapEntry } from "@/lib/sitemaps";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=86400";

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
  "/team-hotel-booking",
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

  const response = xmlResponse(buildSitemapXml(entries));
  response.headers.set("Cache-Control", CACHE_CONTROL);
  return response;
}
