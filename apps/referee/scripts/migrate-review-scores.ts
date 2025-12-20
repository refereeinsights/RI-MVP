#!/usr/bin/env ts-node
/**
 * One-time script to convert 0–100 referee review scores into the new 1–5 whistle scale.
 *
 * Usage:
 *   tsx scripts/migrate-review-scores.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL environment variables.
 *
 * The script processes reviews in batches (default 200 at a time), skips rows that have
 * already been migrated (scores between 1 and 5), and logs a summary when finished.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const BATCH_SIZE = Number(process.env.REVIEW_MIGRATION_BATCH ?? 200);

type ReviewRow = {
  id: string;
  overall_score: number;
  logistics_score: number;
  facilities_score: number;
  pay_score: number;
  support_score: number;
};

function percentToWhistle(value: number) {
  if (value == null || Number.isNaN(value)) return null;
  // Convert 0-100 into 1-5 range, rounding to nearest whole whistle.
  const scale = Math.round((value / 100) * 5);
  return Math.min(5, Math.max(1, scale));
}

function needsMigration(row: ReviewRow) {
  const values = [
    row.overall_score,
    row.logistics_score,
    row.facilities_score,
    row.pay_score,
    row.support_score,
  ];
  return values.some((value) => value > 5);
}

async function migrateBatch(offset: number) {
  const { data, error } = await supabase
    .from("tournament_referee_reviews")
    .select(
      "id,overall_score,logistics_score,facilities_score,pay_score,support_score",
      { count: "exact" }
    )
    .order("created_at", { ascending: true })
    .range(offset, offset + BATCH_SIZE - 1);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as ReviewRow[];
  const updates: ReviewRow[] = [];

  for (const row of rows) {
    if (!needsMigration(row)) continue;
    updates.push({
      ...row,
      overall_score: percentToWhistle(row.overall_score) ?? 1,
      logistics_score: percentToWhistle(row.logistics_score) ?? 1,
      facilities_score: percentToWhistle(row.facilities_score) ?? 1,
      pay_score: percentToWhistle(row.pay_score) ?? 1,
      support_score: percentToWhistle(row.support_score) ?? 1,
    });
  }

  return { rows, updates };
}

async function run() {
  console.log("Starting referee review score migration (percentage -> 1-5 whistles)...");

  let offset = 0;
  let processed = 0;
  let updated = 0;

  while (true) {
    const { rows, updates } = await migrateBatch(offset);
    if (rows.length === 0) break;

    processed += rows.length;
    offset += rows.length;

    if (updates.length > 0) {
      const { error } = await supabase.from("tournament_referee_reviews").upsert(updates, {
        onConflict: "id",
      });
      if (error) {
        console.error("Failed to update batch:", error.message);
        process.exit(1);
      }
      updated += updates.length;
      console.log(
        `Processed ${processed} rows (${updated} updated). Last updated review: ${updates[updates.length - 1].id}`
      );
    } else {
      console.log(`Processed ${processed} rows (no updates needed in this batch).`);
    }
  }

  console.log(
    `Migration complete. ${processed} reviews checked, ${updated} updated to whistle scale.`
  );
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
