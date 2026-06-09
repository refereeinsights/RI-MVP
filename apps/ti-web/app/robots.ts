import type { MetadataRoute } from "next";

const SITE_ORIGIN = "https://www.tournamentinsights.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/account", "/api/", "/admin", "/weekend-planner/shared/", "/weekend-planner/calendar/"] }],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
