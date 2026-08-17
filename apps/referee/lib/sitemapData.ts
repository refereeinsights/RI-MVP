import "server-only";

import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TOURNAMENT_SITEMAP_PAGE_SIZE, VENUE_SITEMAP_PAGE_SIZE } from "@/lib/sitemaps";

export const RI_SITEMAP_CACHE_VERSION = "v1";

export const RI_SITEMAP_INDEX_COUNTS_TAG = `ri:sitemap:index-counts:${RI_SITEMAP_CACHE_VERSION}`;
export const RI_SITEMAP_TOURNAMENT_ROWS_TAG = `ri:sitemap:tournament-rows:${RI_SITEMAP_CACHE_VERSION}`;
export const RI_SITEMAP_VENUE_ROWS_TAG = `ri:sitemap:venue-rows:${RI_SITEMAP_CACHE_VERSION}`;

const INDEX_DATA_TTL_SECONDS = 24 * 60 * 60;
const SHARD_DATA_TTL_SECONDS = 6 * 60 * 60;

export type RiTournamentSitemapRow = { slug: string | null; updated_at: string | null };
export type RiVenueSitemapRow = {
  id: string | null;
  seo_slug: string | null;
  reviews_last_updated_at: string | null;
};

function requireCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} returned an invalid count`);
  }
  if (value === 0) console.warn(`[ri-sitemap-cache] ${label} returned zero`);
  return value;
}

function requireArray<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`${label} returned an invalid response shape`);
  if (value.length === 0) console.warn(`[ri-sitemap-cache] ${label} returned zero rows`);
  return value as T[];
}

function requireRows<T>(value: unknown, label: string, isRow: (row: unknown) => row is T): T[] {
  const rows = requireArray<unknown>(value, label);
  if (!rows.every(isRow)) throw new Error(`${label} returned an invalid row shape`);
  return rows;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isTournamentRow(value: unknown): value is RiTournamentSitemapRow {
  return isRecord(value) && isNullableString(value.slug) && isNullableString(value.updated_at);
}

function isVenueRow(value: unknown): value is RiVenueSitemapRow {
  return (
    isRecord(value) &&
    isNullableString(value.id) &&
    isNullableString(value.seo_slug) &&
    isNullableString(value.reviews_last_updated_at)
  );
}

async function loadRiSitemapIndexCounts() {
  const startedAt = Date.now();
  const [tournamentResult, venueResult] = await Promise.all([
    supabaseAdmin
      .from("tournaments_public" as any)
      .select("id", { count: "exact", head: true })
      .not("slug", "is", null),
    supabaseAdmin
      .from("venues" as any)
      .select("id", { count: "exact", head: true })
      .not("name", "is", null),
  ]);
  if (tournamentResult.error) throw new Error(`Tournament sitemap count failed: ${tournamentResult.error.message}`);
  if (venueResult.error) throw new Error(`Venue sitemap count failed: ${venueResult.error.message}`);

  const result = {
    tournamentCount: requireCount(tournamentResult.count, "Tournament sitemap count"),
    venueCount: requireCount(venueResult.count, "Venue sitemap count"),
  };
  console.info("[ri-sitemap-cache] Refreshed index counts", {
    durationMs: Date.now() - startedAt,
    ...result,
  });
  return result;
}

async function loadRiTournamentSitemapRows(page: number) {
  const startedAt = Date.now();
  const from = (page - 1) * TOURNAMENT_SITEMAP_PAGE_SIZE;
  const to = from + TOURNAMENT_SITEMAP_PAGE_SIZE - 1;
  const { data, error } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("slug,updated_at")
    .not("slug", "is", null)
    .order("slug", { ascending: true })
    .range(from, to);
  if (error) throw new Error(`Tournament sitemap page ${page} failed: ${error.message}`);
  const rows = requireRows<RiTournamentSitemapRow>(data, `Tournament sitemap page ${page}`, isTournamentRow);
  console.info("[ri-sitemap-cache] Refreshed tournament shard", {
    durationMs: Date.now() - startedAt,
    page,
    rowCount: rows.length,
  });
  return rows;
}

async function loadRiVenueSitemapRows(page: number) {
  const startedAt = Date.now();
  const from = (page - 1) * VENUE_SITEMAP_PAGE_SIZE;
  const to = from + VENUE_SITEMAP_PAGE_SIZE - 1;
  const { data, error } = await supabaseAdmin
    .from("venues" as any)
    .select("id,seo_slug,reviews_last_updated_at")
    .not("name", "is", null)
    .order("id", { ascending: true })
    .range(from, to);
  if (error) throw new Error(`Venue sitemap page ${page} failed: ${error.message}`);
  const rows = requireRows<RiVenueSitemapRow>(data, `Venue sitemap page ${page}`, isVenueRow);
  console.info("[ri-sitemap-cache] Refreshed venue shard", {
    durationMs: Date.now() - startedAt,
    page,
    rowCount: rows.length,
  });
  return rows;
}

// Cache-key convention: bump RI_SITEMAP_CACHE_VERSION whenever loader query
// logic, arguments, filtering, or returned data shape changes.
export const getRiSitemapIndexCounts = unstable_cache(
  loadRiSitemapIndexCounts,
  [RI_SITEMAP_INDEX_COUNTS_TAG],
  { revalidate: INDEX_DATA_TTL_SECONDS, tags: [RI_SITEMAP_INDEX_COUNTS_TAG] }
);

export const getRiTournamentSitemapRows = unstable_cache(
  loadRiTournamentSitemapRows,
  [RI_SITEMAP_TOURNAMENT_ROWS_TAG],
  { revalidate: SHARD_DATA_TTL_SECONDS, tags: [RI_SITEMAP_TOURNAMENT_ROWS_TAG] }
);

export const getRiVenueSitemapRows = unstable_cache(loadRiVenueSitemapRows, [RI_SITEMAP_VENUE_ROWS_TAG], {
  revalidate: SHARD_DATA_TTL_SECONDS,
  tags: [RI_SITEMAP_VENUE_ROWS_TAG],
});
