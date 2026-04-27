/**
 * One-time backfill: stamp categories_fetched on all owls_eye_runs rows that
 * pre-date the versioning system (where the column is NULL).
 *
 * All legacy runs used the same four categories (food, coffee, hotel,
 * sporting_goods), so we can safely mark them all as complete without
 * cross-referencing owls_eye_nearby_food.
 *
 * Run order:
 *   1. Apply migration: 20260427_owls_eye_categories_fetched.sql
 *   2. Run this script: npx tsx apps/referee/scripts/backfill_owls_eye_categories.ts
 *   3. Deploy code changes (admin page + upsertNearbyForRun)
 *
 * After this script completes, the admin page will only surface the ~2,177
 * venues that genuinely have no run yet, instead of all 3,940 linked venues.
 */

import { getAdminSupabase } from "@/server/owlseye/supabase/admin";
import { CURRENT_OWL_CATEGORIES } from "@/owlseye/categories";

const PAGE_SIZE = 500;

async function main() {
  const supabase = getAdminSupabase();
  let page = 0;
  let totalUpdated = 0;

  console.log("Starting owls_eye_runs categories_fetched backfill…");
  console.log("Categories to stamp:", CURRENT_OWL_CATEGORIES);

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("owls_eye_runs" as any)
      .select("id")
      .is("categories_fetched", null)
      .range(from, to);

    if (error) {
      console.error("Fetch error:", error.message);
      process.exit(1);
    }

    const rows = (data ?? []) as Array<{ id: string }>;
    if (rows.length === 0) break;

    const ids = rows.map((r) => r.id);
    const { error: updateError } = await supabase
      .from("owls_eye_runs" as any)
      .update({ categories_fetched: [...CURRENT_OWL_CATEGORIES] })
      .in("id", ids);

    if (updateError) {
      console.error(`Update error on page ${page}:`, updateError.message);
      process.exit(1);
    }

    totalUpdated += ids.length;
    console.log(`Page ${page}: updated ${ids.length} rows (total: ${totalUpdated})`);

    if (rows.length < PAGE_SIZE) break;
    page++;
  }

  console.log(`Done. Total rows stamped: ${totalUpdated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
