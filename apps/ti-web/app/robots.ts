import type { MetadataRoute } from "next";

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.tournamentinsights.com").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
