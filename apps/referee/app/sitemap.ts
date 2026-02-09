import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.refereeinsights.com").replace(/\/+$/, "");

function normalizeSportSlug(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data } = await supabaseAdmin
    .from("tournaments" as any)
    .select("slug,sport,state,updated_at,status,is_canonical")
    .eq("status", "published")
    .eq("is_canonical", true);

  const rows = (data ?? []) as Array<{ slug: string; sport: string | null; state: string | null; updated_at?: string | null }>;
  const entries: MetadataRoute.Sitemap = [];
  const seen = new Set<string>();
  const now = new Date();

  const add = (path: string, lastModified?: string | null) => {
    const url = `${SITE_ORIGIN}${path}`;
    if (seen.has(url)) return;
    seen.add(url);
    entries.push({
      url: `${SITE_ORIGIN}${path}`,
      lastModified: lastModified ? new Date(lastModified) : now,
    });
  };

  add("/tournaments");
  add("/tournaments/hubs/soccer");
  add("/tournaments/hubs/basketball");

  const sportSet = new Set<string>();
  const sportStateSet = new Set<string>();

  rows.forEach((row) => {
    if (row.sport) {
      const sportSlug = normalizeSportSlug(row.sport);
      if (sportSlug) {
        sportSet.add(sportSlug);
        if (row.state) {
          sportStateSet.add(`${sportSlug}/${row.state.trim().toLowerCase()}`);
        }
      }
    }
  });

  sportSet.forEach((sportSlug) => add(`/tournaments/hubs/${sportSlug}`));
  sportStateSet.forEach((sportState) => add(`/tournaments/hubs/${sportState}`));

  rows.forEach((row) => {
    if (!row.slug) return;
    add(`/tournaments/${row.slug}`, row.updated_at ?? null);
  });

  return entries;
}
