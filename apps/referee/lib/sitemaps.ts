import { NextResponse } from "next/server";

export const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.refereeinsights.com").replace(/\/+$/, "");
export const TOURNAMENT_SITEMAP_PAGE_SIZE = 500;

export type SitemapEntry = {
  url: string;
  lastModified?: Date | string | null;
};

export const STATIC_SITEMAP_PATHS = [
  "/",
  "/assignors",
  "/content-standards",
  "/disclaimer",
  "/feedback",
  "/gear",
  "/how-it-works",
  "/privacy",
  "/referrals",
  "/schools",
  "/terms",
  "/tournament-insights",
  "/tournaments",
  "/venues",
] as const;

export const HUB_SPORT_SLUGS = [
  "soccer",
  "basketball",
  "football",
  "baseball",
  "softball",
  "volleyball",
  "lacrosse",
  "wrestling",
  "hockey",
] as const;

export const HUB_STATE_PATHS = [
  "/tournaments/hubs/soccer/arizona",
  "/tournaments/hubs/soccer/california",
  "/tournaments/hubs/soccer/florida",
  "/tournaments/hubs/soccer/north-carolina",
] as const;

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toIsoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function buildSitemapXml(entries: SitemapEntry[]) {
  const body = entries
    .map((entry) => {
      const lastModified = toIsoDate(entry.lastModified);
      return [
        "  <url>",
        `    <loc>${escapeXml(entry.url)}</loc>`,
        lastModified ? `    <lastmod>${escapeXml(lastModified)}</lastmod>` : null,
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    body,
    "</urlset>",
  ].join("\n");
}

export function buildSitemapIndexXml(urls: string[]) {
  const body = urls
    .map((url) => ["  <sitemap>", `    <loc>${escapeXml(url)}</loc>`, "  </sitemap>"].join("\n"))
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    body,
    "</sitemapindex>",
  ].join("\n");
}

export function xmlResponse(xml: string) {
  return new NextResponse(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
    },
  });
}
