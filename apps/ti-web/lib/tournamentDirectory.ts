import "server-only";

import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  normalizeTournamentDirectoryPage,
  TOURNAMENT_DIRECTORY_PAGE_SIZE,
  TOURNAMENT_DIRECTORY_QUERY_LIMIT,
} from "../../../packages/lib/tournament-read";

export const TI_TOURNAMENT_DIRECTORY_CACHE_VERSION = "v1";
export const TI_TOURNAMENT_DIRECTORY_CACHE_TAG = `ti:tournament-directory:${TI_TOURNAMENT_DIRECTORY_CACHE_VERSION}`;
export const TI_TOURNAMENT_DIRECTORY_COUNTS_CACHE_TAG = `ti:tournament-directory-counts:${TI_TOURNAMENT_DIRECTORY_CACHE_VERSION}`;
const DIRECTORY_TTL_SECONDS = 5 * 60;
const MAX_CACHED_PAGE = 10;
const ALLOWED_SPORTS = new Set([
  "ayso",
  "baseball",
  "basketball",
  "football",
  "hockey",
  "lacrosse",
  "soccer",
  "softball",
  "volleyball",
  "wrestling",
  "futsal",
]);

export type TiDirectoryTournament = {
  id: string;
  name: string;
  slug: string;
  sport: string | null;
  tournament_association?: string | null;
  state: string | null;
  city: string | null;
  zip?: string | null;
  start_date: string | null;
  end_date: string | null;
  official_website_url?: string | null;
  source_url?: string | null;
  level?: string | null;
  tournament_staff_verified?: boolean | null;
  is_demo?: boolean | null;
  distance_miles?: number | null;
  tournament_venues?: Array<{ count?: number | null }> | null;
};

export type TiDirectoryQuery = {
  page: number;
  today: string;
  q: string;
  states: string[];
  sports: string[];
  includePast: boolean;
  aysoOnly: boolean;
  includeLeagues: boolean;
  monthStart: string | null;
  monthEnd: string | null;
  radius: null | {
    latitude: number;
    longitude: number;
    miles: number;
  };
};

export type TiDirectoryPage = {
  tournaments: TiDirectoryTournament[];
  page: number;
  hasNextPage: boolean;
};

export function normalizeDirectoryPage(value: unknown): number {
  return normalizeTournamentDirectoryPage(value);
}

function normalizeQuery(input: TiDirectoryQuery): TiDirectoryQuery {
  return {
    ...input,
    page: normalizeDirectoryPage(input.page),
    q: input.q.trim(),
    states: Array.from(
      new Set(input.states.map((value) => value.trim().toUpperCase()).filter((value) => /^[A-Z]{2}$/.test(value)))
    ).sort(),
    sports: Array.from(
      new Set(input.sports.map((value) => value.trim().toLowerCase()).filter((value) => ALLOWED_SPORTS.has(value)))
    ).sort(),
  };
}

function isTournament(value: unknown): value is TiDirectoryTournament {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.name === "string" && typeof row.slug === "string";
}

async function loadTiTournamentDirectory(input: TiDirectoryQuery): Promise<TiDirectoryPage> {
  const queryInput = normalizeQuery(input);
  const startedAt = Date.now();
  const offset = (queryInput.page - 1) * TOURNAMENT_DIRECTORY_PAGE_SIZE;

  let result;
  if (queryInput.radius) {
    result = await (supabaseAdmin as any).rpc("list_tournaments_public_within_radius_v1", {
      p_center_lat: queryInput.radius.latitude,
      p_center_lng: queryInput.radius.longitude,
      p_radius_miles: queryInput.radius.miles,
      p_limit: TOURNAMENT_DIRECTORY_QUERY_LIMIT,
      p_offset: offset,
      p_today: queryInput.today,
      p_include_past: queryInput.includePast,
      p_q: queryInput.q || null,
      p_start_date_gte: queryInput.monthStart,
      p_start_date_lt: queryInput.monthEnd,
      p_ayso_only: queryInput.aysoOnly,
    });
  } else {
    let query = supabaseAdmin
      .from("tournaments_public" as any)
      .select(
        "id,name,slug,sport,tournament_association,state,city,zip,start_date,end_date,official_website_url,source_url,level,tournament_staff_verified,is_demo,tournament_venues(count)"
      )
      .order("is_demo", { ascending: false })
      .order("start_date", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + TOURNAMENT_DIRECTORY_QUERY_LIMIT - 1);

    if (!queryInput.includePast) {
      query = query.or(`is_demo.eq.true,start_date.gte.${queryInput.today},end_date.gte.${queryInput.today}`);
    }
    if (queryInput.states.length) query = query.in("state", queryInput.states);
    if (queryInput.sports.length) query = query.in("sport", queryInput.sports);
    if (queryInput.aysoOnly) query = query.eq("tournament_association", "AYSO");
    if (!queryInput.includeLeagues) query = query.not("name", "ilike", "%league%");
    if (queryInput.q) query = query.or(`name.ilike.%${queryInput.q}%,city.ilike.%${queryInput.q}%`);
    if (queryInput.monthStart) query = query.gte("start_date", queryInput.monthStart);
    if (queryInput.monthEnd) query = query.lt("start_date", queryInput.monthEnd);
    result = await query;
  }

  if (result.error) throw result.error;
  if (!Array.isArray(result.data)) throw new Error("TI tournament directory returned an invalid response shape");
  if (!result.data.every(isTournament)) throw new Error("TI tournament directory returned an invalid row shape");

  let rows = result.data as TiDirectoryTournament[];
  if (queryInput.radius) {
    if (queryInput.states.length) {
      rows = rows.filter((row) => queryInput.states.includes((row.state ?? "").trim().toUpperCase()));
    }
    if (queryInput.sports.length) {
      rows = rows.filter((row) => queryInput.sports.includes((row.sport ?? "").trim().toLowerCase()));
    }
    if (!queryInput.includeLeagues) {
      rows = rows.filter((row) => !/\bleague\b/i.test(row.name));
    }
  }

  const pageResult = {
    tournaments: rows.slice(0, TOURNAMENT_DIRECTORY_PAGE_SIZE),
    page: queryInput.page,
    hasNextPage: result.data.length > TOURNAMENT_DIRECTORY_PAGE_SIZE,
  };
  console.info("[ti-tournament-directory] Loaded", {
    durationMs: Date.now() - startedAt,
    rowCount: pageResult.tournaments.length,
    requestedRows: result.data.length,
    page: queryInput.page,
    source: queryInput.radius ? "radius_rpc" : "public_view",
    cacheVersion: TI_TOURNAMENT_DIRECTORY_CACHE_VERSION,
  });
  return pageResult;
}

// Bump the version whenever query filters, ordering, selected fields, or result shape changes.
const getCachedTiTournamentDirectory = unstable_cache(
  loadTiTournamentDirectory,
  [TI_TOURNAMENT_DIRECTORY_CACHE_TAG],
  { revalidate: DIRECTORY_TTL_SECONDS, tags: [TI_TOURNAMENT_DIRECTORY_CACHE_TAG] }
);

export async function getTiTournamentDirectory(input: TiDirectoryQuery): Promise<TiDirectoryPage> {
  const normalized = normalizeQuery(input);
  const isControlledCacheShape =
    !normalized.q &&
    !normalized.radius &&
    normalized.page <= MAX_CACHED_PAGE &&
    normalized.states.length <= 1 &&
    normalized.sports.length <= 1;
  return isControlledCacheShape
    ? getCachedTiTournamentDirectory(normalized)
    : loadTiTournamentDirectory(normalized);
}

async function loadTiDirectoryHeatmapCounts(sport: string | null) {
  const startedAt = Date.now();
  const { data, error } = await (supabaseAdmin as any).rpc(
    "get_public_directory_tournament_counts_by_state_sport",
    { p_sport: sport }
  );
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("TI directory heatmap counts returned an invalid response shape");

  const counts: Record<string, number> = {};
  for (const row of data as Array<{ state?: unknown; count?: unknown }>) {
    const state = String(row.state ?? "").trim().toUpperCase();
    const count = Number(row.count ?? 0);
    if (!/^[A-Z]{2}$/.test(state) || !Number.isSafeInteger(count) || count < 0) {
      throw new Error("TI directory heatmap counts returned an invalid row shape");
    }
    counts[state] = count;
  }
  const result = { counts, max: Math.max(0, ...Object.values(counts)) };
  console.info("[ti-tournament-directory] Refreshed heatmap counts", {
    durationMs: Date.now() - startedAt,
    stateCount: Object.keys(counts).length,
    sport,
    cacheVersion: TI_TOURNAMENT_DIRECTORY_CACHE_VERSION,
  });
  return result;
}

const getCachedTiDirectoryHeatmapCounts = unstable_cache(
  loadTiDirectoryHeatmapCounts,
  [TI_TOURNAMENT_DIRECTORY_COUNTS_CACHE_TAG],
  { revalidate: DIRECTORY_TTL_SECONDS, tags: [TI_TOURNAMENT_DIRECTORY_COUNTS_CACHE_TAG] }
);

export async function getTiDirectoryHeatmapCounts(sport: string | null) {
  const normalizedSport = sport?.trim().toLowerCase() ?? null;
  const safeSport = normalizedSport && ALLOWED_SPORTS.has(normalizedSport) ? normalizedSport : null;
  return getCachedTiDirectoryHeatmapCounts(safeSport);
}
