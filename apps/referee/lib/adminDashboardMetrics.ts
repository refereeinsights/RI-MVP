import "server-only";

import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSportValidationCounts, type SportValidationCounts } from "@/lib/validation/getSportValidationCounts";

export const ADMIN_INVENTORY_METRICS_TAG = "ri-admin-inventory-metrics-v1";
export const ADMIN_OPERATIONAL_METRICS_TAG = "ri-admin-operational-metrics-v1";
export const ADMIN_OUTBOUND_METRICS_TAG = "ri-admin-outbound-metrics-v1";
export const ADMIN_COVERAGE_METRICS_TAG = "ri-admin-coverage-metrics-v1";

const EIGHT_HOURS_SECONDS = 8 * 60 * 60;
const ONE_HOUR_SECONDS = 60 * 60;
const FIVE_MINUTES_SECONDS = 5 * 60;

type CountResult = { count: number | null; error: { message?: string } | null };

function requireCount(result: CountResult, label: string): number {
  if (result.error || typeof result.count !== "number") {
    throw new Error(`${label} unavailable: ${result.error?.message ?? "missing count"}`);
  }
  return result.count;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function loadTournamentVenueIds(tournamentIds: string[]): Promise<Set<string>> {
  const linkedTournamentIds = new Set<string>();
  const chunkSize = 200;

  for (let index = 0; index < tournamentIds.length; index += chunkSize) {
    const chunk = tournamentIds.slice(index, index + chunkSize);
    const { data, error } = await supabaseAdmin
      .from("tournament_venues" as any)
      .select("tournament_id")
      .in("tournament_id", chunk)
      .eq("is_inferred", false);

    if (error) throw new Error(`Tournament venue coverage unavailable: ${error.message}`);
    for (const row of (data ?? []) as Array<{ tournament_id?: string | null }>) {
      if (row.tournament_id) linkedTournamentIds.add(row.tournament_id);
    }
  }

  return linkedTournamentIds;
}

async function loadInventoryMetrics() {
  const today = new Date().toISOString().slice(0, 10);
  const [totalResult, publishedResult, upcomingResult, validationCounts] = await Promise.all([
    supabaseAdmin.from("tournaments" as any).select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("tournaments" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("is_canonical", true),
    supabaseAdmin
      .from("tournaments" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("is_canonical", true)
      .or(`is_demo.eq.true,start_date.gte.${today},end_date.gte.${today}`),
    getSportValidationCounts(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    tournamentsDbTotal: requireCount(totalResult, "Tournament total"),
    publishedCanonicalCount: requireCount(publishedResult, "Published tournament total"),
    publicDirectoryUpcomingCount: requireCount(upcomingResult, "Upcoming tournament total"),
    validationCounts,
  };
}

async function loadOperationalMetrics() {
  const [
    draftResult,
    missingVenueResult,
    missingUrlResult,
    missingDateResult,
    missingDirectorEmailResult,
    assignorNeedsReviewResult,
    pendingVerificationResult,
    pendingTournamentReviewResult,
    pendingSchoolReviewResult,
    pendingTournamentContactResult,
    pendingRefereeContactResult,
  ] = await Promise.all([
    supabaseAdmin.from("tournaments" as any).select("id", { count: "exact", head: true }).eq("status", "draft"),
    (supabaseAdmin as any).rpc("list_missing_venue_link_tournaments", {
      p_limit: 1,
      p_offset: 0,
      p_state: null,
      p_q: null,
    }),
    supabaseAdmin
      .from("tournaments" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("is_canonical", true)
      .is("official_website_url", null),
    supabaseAdmin
      .from("tournaments" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("is_canonical", true)
      .is("start_date", null)
      .is("end_date", null),
    supabaseAdmin
      .from("tournaments" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("is_canonical", true)
      .or("tournament_director_email.is.null,tournament_director_email.eq."),
    supabaseAdmin
      .from("assignor_source_records" as any)
      .select("id", { count: "exact", head: true })
      .eq("review_status", "needs_review"),
    supabaseAdmin
      .from("referee_verification_requests" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabaseAdmin
      .from("tournament_referee_reviews" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabaseAdmin
      .from("school_referee_reviews" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabaseAdmin
      .from("tournament_contacts" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabaseAdmin
      .from("referee_contacts" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  if (missingVenueResult.error) {
    throw new Error(`Missing venue count unavailable: ${missingVenueResult.error.message}`);
  }
  const missingVenueRows = (missingVenueResult.data ?? []) as Array<{ total_count?: number | null }>;
  const missingVenueCount = Number(missingVenueRows[0]?.total_count ?? 0);
  if (!Number.isFinite(missingVenueCount)) throw new Error("Missing venue count unavailable: invalid count");

  const draftCount = requireCount(draftResult, "Draft count");
  return {
    generatedAt: new Date().toISOString(),
    draftCount,
    missingVenueCount,
    missingUrlCount: requireCount(missingUrlResult, "Missing URL count"),
    missingDateCount: requireCount(missingDateResult, "Missing date count"),
    missingDirectorEmailCount: requireCount(missingDirectorEmailResult, "Missing director email count"),
    assignorNeedsReviewCount: requireCount(assignorNeedsReviewResult, "Assignor review count"),
    pendingVerificationCount: requireCount(pendingVerificationResult, "Pending verification count"),
    pendingTournamentReviewCount: requireCount(pendingTournamentReviewResult, "Pending tournament review count"),
    pendingSchoolReviewCount: requireCount(pendingSchoolReviewResult, "Pending school review count"),
    pendingTournamentContactCount: requireCount(pendingTournamentContactResult, "Pending tournament contact count"),
    pendingRefereeContactCount: requireCount(pendingRefereeContactResult, "Pending referee contact count"),
    pendingUploadsCount: draftCount,
  };
}

async function loadOutboundMetrics() {
  const result = await supabaseAdmin.from("ti_outbound_clicks" as any).select("id", { count: "exact", head: true });
  return {
    generatedAt: new Date().toISOString(),
    outboundOfficialClickCount: requireCount(result, "Official outbound click count"),
  };
}

async function loadCoverageMetrics() {
  const today = new Date().toISOString().slice(0, 10);
  const pageSize = 1000;
  let offset = 0;
  const tournamentRows: Array<{
    id: string;
    sport?: string | null;
    official_website_url?: string | null;
    source_url?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  }> = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("tournaments_public" as any)
      .select("id,sport,official_website_url,source_url,start_date,end_date")
      .or(`is_demo.eq.true,start_date.gte.${today},end_date.gte.${today}`)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Tournament coverage unavailable: ${error.message}`);
    tournamentRows.push(...((data ?? []) as typeof tournamentRows));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

  const linkedTournamentIds = await loadTournamentVenueIds(tournamentRows.map((row) => row.id).filter(Boolean));
  const sportCounts = new Map<string, number>();
  let tournamentsMissingVenueCount = 0;
  let tournamentsMissingUrlsCount = 0;
  let tournamentsMissingDatesCount = 0;

  for (const row of tournamentRows) {
    const sport = String(row.sport ?? "").trim().toLowerCase();
    if (sport) sportCounts.set(sport, (sportCounts.get(sport) ?? 0) + 1);
    if (!linkedTournamentIds.has(row.id)) tournamentsMissingVenueCount += 1;
    if (!hasText(row.official_website_url) && !hasText(row.source_url)) tournamentsMissingUrlsCount += 1;
    if (!hasText(row.start_date) || !hasText(row.end_date)) tournamentsMissingDatesCount += 1;
  }

  const [venueRowsResult, totalVenueResult, owlVenueResult] = await Promise.all([
    supabaseAdmin.from("venues" as any).select("id,address,address1,latitude,longitude,venue_url").limit(5000),
    supabaseAdmin.from("venues" as any).select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("venues" as any)
      .select("id,owls_eye_runs!inner(id)", { count: "exact", head: true })
      .limit(1),
  ]);

  if (venueRowsResult.error) throw new Error(`Venue coverage unavailable: ${venueRowsResult.error.message}`);
  let venuesMissingAddressGeoCount = 0;
  let venuesMissingUrlsCount = 0;
  const venueRows = (venueRowsResult.data ?? []) as Array<{
    address?: string | null;
    address1?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    venue_url?: string | null;
  }>;
  for (const row of venueRows) {
    const missingAddress = !hasText(row.address1) && !hasText(row.address);
    const missingGeo = typeof row.latitude !== "number" || typeof row.longitude !== "number";
    if (missingAddress || missingGeo) venuesMissingAddressGeoCount += 1;
    if (!hasText(row.venue_url)) venuesMissingUrlsCount += 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    tournamentSportCards: Array.from(sportCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([sport, count]) => ({ sport, count })),
    tournamentsMissingVenueCount,
    tournamentsMissingUrlsCount,
    tournamentsMissingDatesCount,
    venuesMissingAddressGeoCount,
    venuesMissingUrlsCount,
    totalVenueCount: requireCount(totalVenueResult, "Venue total"),
    owlRunVenueCount: requireCount(owlVenueResult, "Owl's Eye venue count"),
  };
}

export type AdminInventoryMetrics = Awaited<ReturnType<typeof loadInventoryMetrics>>;
export type AdminOperationalMetrics = Awaited<ReturnType<typeof loadOperationalMetrics>>;
export type AdminOutboundMetrics = Awaited<ReturnType<typeof loadOutboundMetrics>>;
export type AdminCoverageMetrics = Awaited<ReturnType<typeof loadCoverageMetrics>>;

export const getAdminInventoryMetrics = unstable_cache(loadInventoryMetrics, [ADMIN_INVENTORY_METRICS_TAG], {
  revalidate: EIGHT_HOURS_SECONDS,
  tags: [ADMIN_INVENTORY_METRICS_TAG],
});

export const getAdminOperationalMetrics = unstable_cache(loadOperationalMetrics, [ADMIN_OPERATIONAL_METRICS_TAG], {
  revalidate: FIVE_MINUTES_SECONDS,
  tags: [ADMIN_OPERATIONAL_METRICS_TAG],
});

export const getAdminOutboundMetrics = unstable_cache(loadOutboundMetrics, [ADMIN_OUTBOUND_METRICS_TAG], {
  revalidate: ONE_HOUR_SECONDS,
  tags: [ADMIN_OUTBOUND_METRICS_TAG],
});

export const getAdminCoverageMetrics = unstable_cache(loadCoverageMetrics, [ADMIN_COVERAGE_METRICS_TAG], {
  revalidate: EIGHT_HOURS_SECONDS,
  tags: [ADMIN_COVERAGE_METRICS_TAG],
});

export const EMPTY_SPORT_VALIDATION_COUNTS: SportValidationCounts = {
  total: 0,
  confirmed: 0,
  rule_confirmed: 0,
  needs_review: 0,
  conflict: 0,
  unknown: 0,
  likely: 0,
  unconfirmed: 0,
};
