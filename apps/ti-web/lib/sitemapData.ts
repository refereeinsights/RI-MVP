import "server-only";

import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  TOURNAMENT_HOTELS_SITEMAP_PAGE_SIZE,
  TOURNAMENT_SITEMAP_PAGE_SIZE,
  VENUE_SITEMAP_PAGE_SIZE,
} from "@/lib/sitemaps";

export const TI_SITEMAP_CACHE_VERSION = "v1";

export const TI_SITEMAP_INDEX_COUNTS_TAG = `ti:sitemap:index-counts:${TI_SITEMAP_CACHE_VERSION}`;
export const TI_SITEMAP_METRO_ROWS_TAG = `ti:sitemap:metro-rows:${TI_SITEMAP_CACHE_VERSION}`;
export const TI_SITEMAP_TOURNAMENT_ROWS_TAG = `ti:sitemap:tournament-rows:${TI_SITEMAP_CACHE_VERSION}`;
export const TI_SITEMAP_HOTEL_ROWS_TAG = `ti:sitemap:hotel-rows:${TI_SITEMAP_CACHE_VERSION}`;
export const TI_SITEMAP_VENUE_ROWS_TAG = `ti:sitemap:venue-rows:${TI_SITEMAP_CACHE_VERSION}`;

const INDEX_DATA_TTL_SECONDS = 24 * 60 * 60;
const SHARD_DATA_TTL_SECONDS = 6 * 60 * 60;

export type TiMetroHubUrlRow = {
  sport: string | null;
  state: string | null;
  metro_slug: string | null;
  upcoming_tournament_count: number | null;
  last_modified: string | null;
};

export type TiTournamentSitemapRow = { slug: string | null; updated_at: string | null };
export type TiTournamentHotelSitemapRow = { slug: string | null; updated_at: string | null };
export type TiVenueSitemapRow = { id: string | null; seo_slug: string | null };

function requireCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} returned an invalid count`);
  }
  if (value === 0) console.warn(`[ti-sitemap-cache] ${label} returned zero`);
  return value;
}

function requireArray<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`${label} returned an invalid response shape`);
  if (value.length === 0) console.warn(`[ti-sitemap-cache] ${label} returned zero rows`);
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

function isMetroRow(value: unknown): value is TiMetroHubUrlRow {
  return (
    isRecord(value) &&
    isNullableString(value.sport) &&
    isNullableString(value.state) &&
    isNullableString(value.metro_slug) &&
    (typeof value.upcoming_tournament_count === "number" || value.upcoming_tournament_count === null) &&
    isNullableString(value.last_modified)
  );
}

function isTournamentRow(value: unknown): value is TiTournamentSitemapRow {
  return isRecord(value) && isNullableString(value.slug) && isNullableString(value.updated_at);
}

function isVenueRow(value: unknown): value is TiVenueSitemapRow {
  return isRecord(value) && isNullableString(value.id) && isNullableString(value.seo_slug);
}

async function loadTiSitemapIndexCounts() {
  const startedAt = Date.now();
  const [tournamentResult, tournamentHotelResult, venueResult] = await Promise.all([
    supabaseAdmin
      .from("tournaments_public" as any)
      .select("id", { count: "exact", head: true })
      .not("slug", "is", null),
    (supabaseAdmin as any).rpc("get_tournament_hotels_sitemap_page_v1", {
      p_limit: 1,
      p_offset: 0,
    }),
    supabaseAdmin
      .from("venues" as any)
      .select("id", { count: "exact", head: true })
      .not("seo_slug", "is", null),
  ]);

  if (tournamentResult.error) throw new Error(`Tournament sitemap count failed: ${tournamentResult.error.message}`);
  if (tournamentHotelResult.error) {
    throw new Error(`Tournament hotel sitemap count failed: ${tournamentHotelResult.error.message}`);
  }
  if (venueResult.error) throw new Error(`Venue sitemap count failed: ${venueResult.error.message}`);

  const hotelRows = requireRows<{ total_count?: unknown }>(
    tournamentHotelResult.data,
    "Tournament hotel sitemap count",
    (row): row is { total_count?: unknown } => isRecord(row) && "total_count" in row
  );
  const tournamentHotelCount =
    hotelRows.length === 0
      ? 0
      : requireCount(Number(hotelRows[0]?.total_count), "Tournament hotel sitemap count");
  const result = {
    tournamentCount: requireCount(tournamentResult.count, "Tournament sitemap count"),
    tournamentHotelCount,
    venueCount: requireCount(venueResult.count, "Venue sitemap count"),
  };

  console.info("[ti-sitemap-cache] Refreshed index counts", {
    durationMs: Date.now() - startedAt,
    ...result,
  });
  return result;
}

async function loadTiMetroHubRows() {
  const startedAt = Date.now();
  const { data, error } = await supabaseAdmin.rpc("list_indexable_city_metro_hub_urls_v1" as any, {
    p_min_upcoming: 12,
  });
  if (error) throw new Error(`Metro sitemap rows failed: ${error.message}`);
  const rows = requireRows<TiMetroHubUrlRow>(data, "Metro sitemap rows", isMetroRow);
  console.info("[ti-sitemap-cache] Refreshed metro rows", {
    durationMs: Date.now() - startedAt,
    rowCount: rows.length,
  });
  return rows;
}

async function loadTiTournamentSitemapRows(page: number) {
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
  const rows = requireRows<TiTournamentSitemapRow>(data, `Tournament sitemap page ${page}`, isTournamentRow);
  console.info("[ti-sitemap-cache] Refreshed tournament shard", {
    durationMs: Date.now() - startedAt,
    page,
    rowCount: rows.length,
  });
  return rows;
}

async function loadTiTournamentHotelSitemapRows(page: number) {
  const startedAt = Date.now();
  const offset = (page - 1) * TOURNAMENT_HOTELS_SITEMAP_PAGE_SIZE;
  const { data, error } = await (supabaseAdmin as any).rpc("get_tournament_hotels_sitemap_page_v1", {
    p_limit: TOURNAMENT_HOTELS_SITEMAP_PAGE_SIZE,
    p_offset: offset,
  });
  if (error) throw new Error(`Tournament hotel sitemap page ${page} failed: ${error.message}`);
  const rows = requireRows<TiTournamentHotelSitemapRow>(
    data,
    `Tournament hotel sitemap page ${page}`,
    isTournamentRow
  );
  console.info("[ti-sitemap-cache] Refreshed tournament hotel shard", {
    durationMs: Date.now() - startedAt,
    page,
    rowCount: rows.length,
  });
  return rows;
}

async function loadTiVenueSitemapRows(page: number) {
  const startedAt = Date.now();
  const from = (page - 1) * VENUE_SITEMAP_PAGE_SIZE;
  const to = from + VENUE_SITEMAP_PAGE_SIZE - 1;
  const { data, error } = await supabaseAdmin
    .from("venues" as any)
    .select("id,seo_slug")
    .not("seo_slug", "is", null)
    .order("seo_slug", { ascending: true })
    .range(from, to);
  if (error) throw new Error(`Venue sitemap page ${page} failed: ${error.message}`);
  const rows = requireRows<TiVenueSitemapRow>(data, `Venue sitemap page ${page}`, isVenueRow);
  console.info("[ti-sitemap-cache] Refreshed venue shard", {
    durationMs: Date.now() - startedAt,
    page,
    rowCount: rows.length,
  });
  return rows;
}

// Cache-key convention: bump TI_SITEMAP_CACHE_VERSION whenever loader query
// logic, arguments, filtering, or returned data shape changes.
export const getTiSitemapIndexCounts = unstable_cache(
  loadTiSitemapIndexCounts,
  [TI_SITEMAP_INDEX_COUNTS_TAG],
  { revalidate: INDEX_DATA_TTL_SECONDS, tags: [TI_SITEMAP_INDEX_COUNTS_TAG] }
);

export const getTiMetroHubRows = unstable_cache(loadTiMetroHubRows, [TI_SITEMAP_METRO_ROWS_TAG], {
  revalidate: INDEX_DATA_TTL_SECONDS,
  tags: [TI_SITEMAP_METRO_ROWS_TAG],
});

export const getTiTournamentSitemapRows = unstable_cache(
  loadTiTournamentSitemapRows,
  [TI_SITEMAP_TOURNAMENT_ROWS_TAG],
  { revalidate: SHARD_DATA_TTL_SECONDS, tags: [TI_SITEMAP_TOURNAMENT_ROWS_TAG] }
);

export const getTiTournamentHotelSitemapRows = unstable_cache(
  loadTiTournamentHotelSitemapRows,
  [TI_SITEMAP_HOTEL_ROWS_TAG],
  { revalidate: SHARD_DATA_TTL_SECONDS, tags: [TI_SITEMAP_HOTEL_ROWS_TAG] }
);

export const getTiVenueSitemapRows = unstable_cache(loadTiVenueSitemapRows, [TI_SITEMAP_VENUE_ROWS_TAG], {
  revalidate: SHARD_DATA_TTL_SECONDS,
  tags: [TI_SITEMAP_VENUE_ROWS_TAG],
});
