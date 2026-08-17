import "server-only";

import { unstable_cache } from "next/cache";
import * as React from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePublicTournamentSlug } from "../../../packages/lib/tournament-read";

export const TI_PUBLIC_TOURNAMENT_CACHE_VERSION = "v1";
export const TI_PUBLIC_TOURNAMENT_CACHE_TAG = `ti:public-tournament-by-slug:${TI_PUBLIC_TOURNAMENT_CACHE_VERSION}`;

const PUBLIC_TOURNAMENT_TTL_SECONDS = 60 * 60;
const requestCache = (React as unknown as { cache: <Args extends unknown[], Result>(
  fn: (...args: Args) => Result
) => (...args: Args) => Result }).cache;

export type TiPublicTournament = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  start_date: string | null;
  end_date: string | null;
  summary: string | null;
  source_url: string | null;
  official_website_url: string | null;
  sport: string | null;
  level: string | null;
  tournament_staff_verified: boolean | null;
  venue: string | null;
  address: string | null;
  static_map_path: string | null;
  static_map_status: string | null;
  static_map_updated_at: string | null;
};

export type TiPublicTournamentLookupResult =
  | { status: "found"; tournament: TiPublicTournament }
  | { status: "not_found" }
  | { status: "unavailable"; errorCode?: string };

export class PublicTournamentNotFoundError extends Error {
  readonly code = "PUBLIC_TOURNAMENT_NOT_FOUND";

  constructor() {
    super("Public tournament not found");
    this.name = "PublicTournamentNotFoundError";
  }
}

function nullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isTiPublicTournament(value: unknown): value is TiPublicTournament {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.slug === "string" &&
    typeof row.name === "string" &&
    nullableString(row.city) &&
    nullableString(row.state) &&
    nullableString(row.zip) &&
    (typeof row.latitude === "number" || row.latitude === null) &&
    (typeof row.longitude === "number" || row.longitude === null) &&
    nullableString(row.start_date) &&
    nullableString(row.end_date) &&
    nullableString(row.summary) &&
    nullableString(row.source_url) &&
    nullableString(row.official_website_url) &&
    nullableString(row.sport) &&
    nullableString(row.level) &&
    (typeof row.tournament_staff_verified === "boolean" || row.tournament_staff_verified === null) &&
    nullableString(row.venue) &&
    nullableString(row.address) &&
    nullableString(row.static_map_path) &&
    nullableString(row.static_map_status) &&
    nullableString(row.static_map_updated_at)
  );
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof PublicTournamentNotFoundError ||
    (error instanceof Error && error.name === "PublicTournamentNotFoundError") ||
    errorCode(error) === "PUBLIC_TOURNAMENT_NOT_FOUND"
  );
}

async function loadTiPublicTournamentBySlug(slug: string): Promise<TiPublicTournament> {
  const startedAt = Date.now();
  const { data, error } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select(
      "id,slug,name,city,state,zip,latitude,longitude,start_date,end_date,summary,source_url,official_website_url,sport,level,tournament_staff_verified,venue,address,static_map_path,static_map_status,static_map_updated_at"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new PublicTournamentNotFoundError();
  if (!isTiPublicTournament(data)) throw new Error("TI public tournament lookup returned an invalid row shape");

  console.info("[ti-public-tournament-cache] Refreshed", {
    slug,
    durationMs: Date.now() - startedAt,
    cacheVersion: TI_PUBLIC_TOURNAMENT_CACHE_VERSION,
    outcome: "found",
  });
  return data;
}

// Bump the version when the query, selected fields, validation, or result shape changes.
// unstable_cache stores successful returns only; the typed not-found exception is
// propagated without becoming a cross-request cached 404.
const getCachedTiPublicTournamentBySlug = unstable_cache(
  loadTiPublicTournamentBySlug,
  [TI_PUBLIC_TOURNAMENT_CACHE_TAG],
  { revalidate: PUBLIC_TOURNAMENT_TTL_SECONDS, tags: [TI_PUBLIC_TOURNAMENT_CACHE_TAG] }
);

// React cache deduplicates both successful returns and thrown errors during one
// server render, including generateMetadata plus the page component.
export const getTiPublicTournament = requestCache(async (value: string): Promise<TiPublicTournamentLookupResult> => {
  const slug = normalizePublicTournamentSlug(value);
  if (!slug) return { status: "not_found" };

  const startedAt = Date.now();
  try {
    return { status: "found", tournament: await getCachedTiPublicTournamentBySlug(slug) };
  } catch (error) {
    if (isNotFoundError(error)) {
      console.info("[ti-public-tournament-cache] Not found", {
        slug,
        durationMs: Date.now() - startedAt,
        cacheVersion: TI_PUBLIC_TOURNAMENT_CACHE_VERSION,
      });
      return { status: "not_found" };
    }
    console.error("[ti-public-tournament-cache] Unavailable", {
      slug,
      durationMs: Date.now() - startedAt,
      cacheVersion: TI_PUBLIC_TOURNAMENT_CACHE_VERSION,
      errorCode: errorCode(error) ?? "unknown",
    });
    return { status: "unavailable", errorCode: errorCode(error) };
  }
});
