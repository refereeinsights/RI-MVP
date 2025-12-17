import type { SupabaseClient } from "@supabase/supabase-js";
import type { RefereeWhistleScoreStatus } from "./types/refereeReview";

export type RawWhistleScoreRow = {
  tournament_id: string;
  ai_score: number | null;
  review_count: number | null;
  summary: string | null;
  status: RefereeWhistleScoreStatus | null;
};

export function deriveSeriesSlug(slug: string | null | undefined) {
  if (!slug) return null;
  const trimmed = slug.trim();
  if (!trimmed) return null;
  return trimmed.replace(/-(19|20)\d{2}$/, "");
}

export function aggregateWhistleScoreRows(rows: RawWhistleScoreRow[]) {
  if (!rows.length) {
    return {
      ai_score: null,
      review_count: 0,
      summary: null,
      status: "clear" as RefereeWhistleScoreStatus,
    };
  }

  let totalReviews = 0;
  let weightedScore = 0;
  let summary: string | null = null;
  let status: RefereeWhistleScoreStatus = "clear";

  for (const row of rows) {
    if (!summary && row.summary) summary = row.summary;
    if (row.status === "needs_moderation") {
      status = "needs_moderation";
    }

    const reviews = Number(row.review_count ?? 0);
    if (!Number.isFinite(reviews) || reviews <= 0) continue;
    const score = Number(row.ai_score ?? 0);
    if (!Number.isFinite(score)) continue;
    totalReviews += reviews;
    weightedScore += score * reviews;
  }

  return {
    ai_score: totalReviews > 0 ? weightedScore / totalReviews : null,
    review_count: totalReviews,
    summary,
    status,
  };
}

type MinimalTournament = { id: string; slug: string | null };

export type TournamentSeriesEntry = {
  seriesSlug: string;
  tournamentIds: string[];
};

export async function loadSeriesTournamentIds(
  supabase: SupabaseClient,
  tournaments: MinimalTournament[]
): Promise<Map<string, TournamentSeriesEntry>> {
  const result = new Map<string, TournamentSeriesEntry>();
  if (!tournaments.length) return result;

  const canonicalSeries = tournaments.map((t) => {
    const rawSlug = (t.slug ?? "").trim();
    const derived = deriveSeriesSlug(rawSlug) ?? rawSlug;
    const seriesSlug = derived || t.id;
    return { ...t, seriesSlug };
  });

  const uniqueSeries = Array.from(new Set(canonicalSeries.map((t) => t.seriesSlug)));
  const filters = uniqueSeries
    .flatMap((series) => [`slug.eq.${series}`, `slug.ilike.${series}-%`])
    .join(",");

  const { data } =
    filters && filters.length
      ? await supabase.from("tournaments").select("id,slug").or(filters)
      : { data: [] as { id: string; slug: string }[] };

  const seriesToIds = new Map<string, string[]>();

  for (const row of (data ?? []) as { id: string; slug: string | null }[]) {
    const rawSlug = (row.slug ?? "").trim();
    const derived = deriveSeriesSlug(rawSlug) ?? rawSlug;
    if (!derived) continue;
    const arr = seriesToIds.get(derived) ?? [];
    arr.push(row.id);
    seriesToIds.set(derived, arr);
  }

  for (const { id, seriesSlug } of canonicalSeries) {
    const ids = Array.from(new Set([...(seriesToIds.get(seriesSlug) ?? []), id]));
    result.set(id, { seriesSlug, tournamentIds: ids });
  }

  return result;
}
