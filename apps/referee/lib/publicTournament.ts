import "server-only";

import { unstable_cache } from "next/cache";
import * as React from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePublicTournamentSlug } from "../../../packages/lib/tournament-read";

export const RI_PUBLIC_TOURNAMENT_CACHE_VERSION = "v1";
export const RI_PUBLIC_TOURNAMENT_CACHE_TAG = `ri:public-tournament-by-slug:${RI_PUBLIC_TOURNAMENT_CACHE_VERSION}`;

const PUBLIC_TOURNAMENT_TTL_SECONDS = 60 * 60;
const requestCache = (React as unknown as { cache: <Args extends unknown[], Result>(
  fn: (...args: Args) => Result
) => (...args: Args) => Result }).cache;

export type RiPublicTournament = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  start_date: string | null;
  end_date: string | null;
  summary: string | null;
  source_url: string | null;
  official_website_url: string | null;
  referee_contact: string | null;
  tournament_director: string | null;
  level: string | null;
  venue: string | null;
  address: string | null;
  sport: string | null;
  tournament_staff_verified: boolean | null;
};

export type RiPublicTournamentLookupResult =
  | { status: "found"; tournament: RiPublicTournament }
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

function isRiPublicTournament(value: unknown): value is RiPublicTournament {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.slug === "string" &&
    typeof row.name === "string" &&
    nullableString(row.city) &&
    nullableString(row.state) &&
    nullableString(row.zip) &&
    nullableString(row.start_date) &&
    nullableString(row.end_date) &&
    nullableString(row.summary) &&
    nullableString(row.source_url) &&
    nullableString(row.official_website_url) &&
    nullableString(row.referee_contact) &&
    nullableString(row.tournament_director) &&
    nullableString(row.level) &&
    nullableString(row.venue) &&
    nullableString(row.address) &&
    nullableString(row.sport) &&
    (typeof row.tournament_staff_verified === "boolean" || row.tournament_staff_verified === null)
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

async function loadRiPublicTournamentBySlug(slug: string): Promise<RiPublicTournament> {
  const startedAt = Date.now();
  const { data, error } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select(
      "id,slug,name,city,state,zip,start_date,end_date,summary,source_url,official_website_url,referee_contact,tournament_director,level,venue,address,sport,tournament_staff_verified"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new PublicTournamentNotFoundError();
  if (!isRiPublicTournament(data)) throw new Error("RI public tournament lookup returned an invalid row shape");

  console.info("[ri-public-tournament-cache] Refreshed", {
    slug,
    durationMs: Date.now() - startedAt,
    cacheVersion: RI_PUBLIC_TOURNAMENT_CACHE_VERSION,
    outcome: "found",
  });
  return data;
}

// Bump the version when the query, selected fields, validation, or result shape changes.
// unstable_cache stores successful returns only; the typed not-found exception is
// propagated without becoming a cross-request cached 404.
const getCachedRiPublicTournamentBySlug = unstable_cache(
  loadRiPublicTournamentBySlug,
  [RI_PUBLIC_TOURNAMENT_CACHE_TAG],
  { revalidate: PUBLIC_TOURNAMENT_TTL_SECONDS, tags: [RI_PUBLIC_TOURNAMENT_CACHE_TAG] }
);

// React cache deduplicates both successful returns and thrown errors during one
// server render, including generateMetadata plus the page component.
export const getRiPublicTournament = requestCache(async (value: string): Promise<RiPublicTournamentLookupResult> => {
  const slug = normalizePublicTournamentSlug(value);
  if (!slug) return { status: "not_found" };

  const startedAt = Date.now();
  try {
    return { status: "found", tournament: await getCachedRiPublicTournamentBySlug(slug) };
  } catch (error) {
    if (isNotFoundError(error)) {
      console.info("[ri-public-tournament-cache] Not found", {
        slug,
        durationMs: Date.now() - startedAt,
        cacheVersion: RI_PUBLIC_TOURNAMENT_CACHE_VERSION,
      });
      return { status: "not_found" };
    }
    console.error("[ri-public-tournament-cache] Unavailable", {
      slug,
      durationMs: Date.now() - startedAt,
      cacheVersion: RI_PUBLIC_TOURNAMENT_CACHE_VERSION,
      errorCode: errorCode(error) ?? "unknown",
    });
    return { status: "unavailable", errorCode: errorCode(error) };
  }
});
