import { supabaseAdmin } from "./supabaseAdmin";

type ReviewRow = Record<string, any>;

type EntityConfig = {
  reviewsTable: string;
  scoresTable: string;
  entityColumn: string;
  summaryLabel: string;
};

type AggregateSummary = {
  processed: number;
  upserted: number;
  deleted: number;
};

type SportAggregateSummary = {
  processed: number;
  upserted: number;
  deleted: number;
};

const ENTITY_CONFIGS: EntityConfig[] = [
  {
    reviewsTable: "tournament_referee_reviews",
    scoresTable: "tournament_referee_scores",
    entityColumn: "tournament_id",
    summaryLabel: "tournament",
  },
  {
    reviewsTable: "school_referee_reviews",
    scoresTable: "school_referee_scores",
    entityColumn: "school_id",
    summaryLabel: "school",
  },
];

function whistleScoreToPercent(avgWhistles: number | null) {
  if (!avgWhistles || !Number.isFinite(avgWhistles)) return null;
  return Math.round((avgWhistles / 5) * 100);
}

function buildSummary(label: string, reviewCount: number) {
  const noun = reviewCount === 1 ? "review" : "reviews";
  return `Based on ${reviewCount} verified ${label} ${noun}.`;
}

async function aggregateForEntity(config: EntityConfig): Promise<AggregateSummary> {
  const { data, error } = await supabaseAdmin
    .from(config.reviewsTable)
    .select(`${config.entityColumn},overall_score,status`);

  if (error) {
    console.error("whistleScores: load error", {
      table: config.reviewsTable,
      message: error.message,
      code: error.code,
      details: (error as any).details,
      hint: (error as any).hint,
    });
    throw new Error(
      `Failed to load ${config.summaryLabel} reviews: ${error.message ?? String(error)}`
    );
  }

  const entities = new Map<
    string,
    {
      total: number;
      count: number;
    }
  >();

  for (const row of (data ?? []) as ReviewRow[]) {
    if (row.status !== "approved") continue;
    const entityId = row[config.entityColumn];
    const score = Number(row.overall_score);
    if (!entityId || !Number.isFinite(score) || score < 1 || score > 5) continue;
    const existing = entities.get(entityId) ?? { total: 0, count: 0 };
    existing.total += score;
    existing.count += 1;
    entities.set(entityId, existing);
  }

  const payload = Array.from(entities.entries()).map(([entityId, agg]) => ({
    [config.entityColumn]: entityId,
    ai_score: whistleScoreToPercent(agg.total / agg.count),
    review_count: agg.count,
    summary: buildSummary(config.summaryLabel, agg.count),
    status: "clear",
    updated_at: new Date().toISOString(),
  }));

  if (payload.length) {
    const { error: upsertError } = await supabaseAdmin
      .from(config.scoresTable)
      .upsert(payload, { onConflict: config.entityColumn });
    if (upsertError) {
      console.error("whistleScores: upsert error", {
        table: config.scoresTable,
        message: upsertError.message,
        code: (upsertError as any).code,
        details: (upsertError as any).details,
        hint: (upsertError as any).hint,
      });
      throw new Error(
        `Failed to upsert ${config.summaryLabel} scores: ${upsertError.message ?? upsertError}`
      );
    }
  }

  const existingIds = await supabaseAdmin
    .from(config.scoresTable)
    .select(config.entityColumn);

  const deleted =
    existingIds.data
      ?.filter((row: any) => row?.[config.entityColumn] && !entities.has(row[config.entityColumn]))
      .map((row: any) => row[config.entityColumn]) ?? [];

  if (deleted.length) {
    await supabaseAdmin
      .from(config.scoresTable)
      .delete()
      .in(config.entityColumn, deleted);
  }

  return {
    processed: data?.length ?? 0,
    upserted: payload.length,
    deleted: deleted.length,
  };
}

async function aggregateSchoolSportScores(): Promise<SportAggregateSummary> {
  const { data, error } = await supabaseAdmin
    .from("school_referee_reviews")
    .select("school_id,overall_score,status,sport");

  if (error) {
    console.error("whistleScores: load error", {
      table: "school_referee_reviews",
      message: error.message,
      code: error.code,
      details: (error as any).details,
      hint: (error as any).hint,
    });
    throw new Error(`Failed to load school reviews: ${error.message ?? String(error)}`);
  }

  const entities = new Map<
    string,
    { total: number; count: number; school_id: string; sport: string }
  >();

  for (const row of (data ?? []) as ReviewRow[]) {
    if (row.status !== "approved") continue;
    const schoolId = row.school_id;
    const sport = typeof row.sport === "string" ? row.sport : "";
    const score = Number(row.overall_score);
    if (!schoolId || !sport || !Number.isFinite(score) || score < 1 || score > 5) continue;
    const key = `${schoolId}::${sport}`;
    const existing = entities.get(key) ?? { total: 0, count: 0, school_id: schoolId, sport };
    existing.total += score;
    existing.count += 1;
    entities.set(key, existing);
  }

  const payload = Array.from(entities.values()).map((agg) => ({
    school_id: agg.school_id,
    sport: agg.sport,
    ai_score: whistleScoreToPercent(agg.total / agg.count),
    review_count: agg.count,
    summary: buildSummary("school", agg.count),
    status: "clear",
    updated_at: new Date().toISOString(),
  }));

  if (payload.length) {
    const { error: upsertError } = await supabaseAdmin
      .from("school_referee_scores_by_sport")
      .upsert(payload, { onConflict: "school_id,sport" });
    if (upsertError) {
      console.error("whistleScores: upsert error", {
        table: "school_referee_scores_by_sport",
        message: upsertError.message,
        code: (upsertError as any).code,
        details: (upsertError as any).details,
        hint: (upsertError as any).hint,
      });
      throw new Error(
        `Failed to upsert school sport scores: ${upsertError.message ?? upsertError}`
      );
    }
  }

  const existingIds = await supabaseAdmin
    .from("school_referee_scores_by_sport")
    .select("school_id,sport");

  const deleted =
    existingIds.data
      ?.filter((row: any) => row?.school_id && row?.sport && !entities.has(`${row.school_id}::${row.sport}`))
      .map((row: any) => ({ school_id: row.school_id, sport: row.sport })) ?? [];

  if (deleted.length) {
    for (const row of deleted) {
      await supabaseAdmin
        .from("school_referee_scores_by_sport")
        .delete()
        .eq("school_id", row.school_id)
        .eq("sport", row.sport);
    }
  }

  return {
    processed: data?.length ?? 0,
    upserted: payload.length,
    deleted: deleted.length,
  };
}

export async function recomputeAllWhistleScores() {
  console.log("whistleScores: start");
  const results: Record<string, AggregateSummary> = {};

  for (const config of ENTITY_CONFIGS) {
    console.log("whistleScores: aggregating", config.summaryLabel);
    results[config.summaryLabel] = await aggregateForEntity(config);
  }

  console.log("whistleScores: aggregating school sport scores");
  const schoolSport = await aggregateSchoolSportScores();
  (results as any).school_sport = schoolSport;

  console.log("whistleScores: done", results);
  return results;
}
