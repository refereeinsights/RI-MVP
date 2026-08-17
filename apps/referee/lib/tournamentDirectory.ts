import "server-only";

import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  normalizeTournamentDirectoryPage,
  TOURNAMENT_DIRECTORY_PAGE_SIZE,
  TOURNAMENT_DIRECTORY_QUERY_LIMIT,
} from "../../../packages/lib/tournament-read";

export const RI_TOURNAMENT_DIRECTORY_CACHE_VERSION = "v1";
export const RI_TOURNAMENT_DIRECTORY_CACHE_TAG = `ri:tournament-directory:${RI_TOURNAMENT_DIRECTORY_CACHE_VERSION}`;
const DIRECTORY_TTL_SECONDS = 5 * 60;
const MAX_CACHED_PAGE = 10;
const ALLOWED_SPORTS = new Set([
  "baseball",
  "basketball",
  "football",
  "hockey",
  "lacrosse",
  "soccer",
  "softball",
  "volleyball",
  "wrestling",
]);

export type RiDirectoryTournament = {
  id: string;
  name: string;
  slug: string;
  sport: string | null;
  level: string | null;
  state: string;
  city: string | null;
  zip?: string | null;
  start_date: string | null;
  end_date: string | null;
  source_url: string;
  official_website_url?: string | null;
  tournament_staff_verified?: boolean | null;
};

export type RiDirectoryQuery = {
  page: number;
  today: string;
  q: string;
  states: string[];
  cities: string[];
  sports: string[];
  includePast: boolean;
  monthStart: string | null;
  monthEnd: string | null;
  matchNone: boolean;
};

export type RiDirectoryPage = {
  tournaments: RiDirectoryTournament[];
  page: number;
  hasNextPage: boolean;
};

export function normalizeDirectoryPage(value: unknown): number {
  return normalizeTournamentDirectoryPage(value);
}

function normalizeQuery(input: RiDirectoryQuery): RiDirectoryQuery {
  return {
    ...input,
    page: normalizeDirectoryPage(input.page),
    q: input.q.trim(),
    states: Array.from(
      new Set(input.states.map((value) => value.trim().toUpperCase()).filter((value) => /^[A-Z]{2}$/.test(value)))
    ).sort(),
    cities: Array.from(new Set(input.cities.map((value) => value.trim()).filter(Boolean))).sort(),
    sports: Array.from(
      new Set(input.sports.map((value) => value.trim().toLowerCase()).filter((value) => ALLOWED_SPORTS.has(value)))
    ).sort(),
  };
}

function isTournament(value: unknown): value is RiDirectoryTournament {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.name === "string" && typeof row.slug === "string";
}

async function loadRiTournamentDirectory(input: RiDirectoryQuery): Promise<RiDirectoryPage> {
  const queryInput = normalizeQuery(input);
  if (queryInput.matchNone) {
    return { tournaments: [], page: queryInput.page, hasNextPage: false };
  }
  const startedAt = Date.now();
  const offset = (queryInput.page - 1) * TOURNAMENT_DIRECTORY_PAGE_SIZE;
  let query = supabaseAdmin
    .from("tournaments_public" as any)
    .select(
      "id,name,slug,sport,level,state,city,zip,start_date,end_date,source_url,official_website_url,tournament_staff_verified"
    )
    .order("start_date", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .range(offset, offset + TOURNAMENT_DIRECTORY_QUERY_LIMIT - 1);

  if (!queryInput.includePast) {
    query = query.or(`start_date.gte.${queryInput.today},end_date.gte.${queryInput.today}`);
  }
  if (queryInput.states.length) query = query.in("state", queryInput.states);
  if (queryInput.cities.length) query = query.in("city", queryInput.cities);
  if (queryInput.sports.length) query = query.in("sport", queryInput.sports);
  if (queryInput.q) query = query.or(`name.ilike.%${queryInput.q}%,city.ilike.%${queryInput.q}%`);
  if (queryInput.monthStart) query = query.gte("start_date", queryInput.monthStart);
  if (queryInput.monthEnd) query = query.lt("start_date", queryInput.monthEnd);

  const { data, error } = await query;
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("RI tournament directory returned an invalid response shape");
  if (!data.every(isTournament)) throw new Error("RI tournament directory returned an invalid row shape");

  const result = {
    tournaments: (data as RiDirectoryTournament[]).slice(0, TOURNAMENT_DIRECTORY_PAGE_SIZE),
    page: queryInput.page,
    hasNextPage: data.length > TOURNAMENT_DIRECTORY_PAGE_SIZE,
  };
  console.info("[ri-tournament-directory] Loaded", {
    durationMs: Date.now() - startedAt,
    rowCount: result.tournaments.length,
    requestedRows: data.length,
    page: queryInput.page,
    cacheVersion: RI_TOURNAMENT_DIRECTORY_CACHE_VERSION,
  });
  return result;
}

// Bump the version whenever query filters, ordering, selected fields, or result shape changes.
const getCachedRiTournamentDirectory = unstable_cache(
  loadRiTournamentDirectory,
  [RI_TOURNAMENT_DIRECTORY_CACHE_TAG],
  { revalidate: DIRECTORY_TTL_SECONDS, tags: [RI_TOURNAMENT_DIRECTORY_CACHE_TAG] }
);

export async function getRiTournamentDirectory(input: RiDirectoryQuery): Promise<RiDirectoryPage> {
  const normalized = normalizeQuery(input);
  const isControlledCacheShape =
    !normalized.q &&
    !normalized.matchNone &&
    normalized.page <= MAX_CACHED_PAGE &&
    normalized.states.length <= 1 &&
    normalized.cities.length === 0 &&
    normalized.sports.length <= 1;
  return isControlledCacheShape
    ? getCachedRiTournamentDirectory(normalized)
    : loadRiTournamentDirectory(normalized);
}
