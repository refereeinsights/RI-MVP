import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SITE_ORIGIN = "https://www.tournamentinsights.com";
const SPORT_HUBS = ["soccer", "baseball", "lacrosse", "basketball", "hockey", "ayso"] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_ORIGIN}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_ORIGIN}/tournaments`, changeFrequency: "daily", priority: 0.9 },
    ...SPORT_HUBS.map((hub) => ({
      url: `${SITE_ORIGIN}/tournaments/${hub}`,
      changeFrequency: "daily" as const,
      priority: 0.85,
    })),
    { url: `${SITE_ORIGIN}/how-it-works`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_ORIGIN}/list-your-tournament`, changeFrequency: "monthly", priority: 0.5 },
  ];

  try {
    const { data, error } = await supabaseAdmin
      .from("tournaments_public" as any)
      .select("slug, updated_at")
      .not("slug", "is", null)
      .limit(2000);

    if (!error && data) {
      const dynamic: MetadataRoute.Sitemap = data
        .filter((row) => row.slug)
        .map((row) => ({
          url: `${SITE_ORIGIN}/tournaments/${row.slug}`,
          lastModified: row.updated_at ? new Date(row.updated_at) : new Date(),
          changeFrequency: "weekly",
          priority: 0.8,
        }));
      return [...staticPages, ...dynamic];
    }
  } catch {
    // fallback to static only
  }

  return staticPages;
}
