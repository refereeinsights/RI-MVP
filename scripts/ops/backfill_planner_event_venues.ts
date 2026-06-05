#!/usr/bin/env node
/* eslint-disable no-console */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { resolvePlannerVenueMatches, type PlannerVenueMatchTarget } from "../../apps/ti-web/lib/planner/venueResolution";

type PlannerEventBackfillRow = PlannerVenueMatchTarget & {
  user_id: string;
  title: string | null;
  source_type: string | null;
};

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function argValue(flag: string) {
  const inline = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function main() {
  const apply = hasFlag("--apply");
  const limit = Math.max(1, Math.min(5000, Number(argValue("--limit") ?? 200)));
  const offset = Math.max(0, Number(argValue("--offset") ?? 0));
  const userId = clean(argValue("--user-id"));

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase
    .from("planner_events")
    .select("id,user_id,title,source_type,venue_id,address_text,city,state")
    .is("venue_id", null)
    .not("address_text", "is", null)
    .range(offset, offset + limit - 1);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as PlannerEventBackfillRow[]).filter((row) => clean(row.address_text));
  if (!rows.length) {
    console.log("No planner events matched the backfill query.");
    return;
  }

  const matches = await resolvePlannerVenueMatches(supabase as any, rows);
  const updates = rows
    .map((row) => {
      const venueId = matches.get(row.id) ?? null;
      return {
        id: row.id,
        user_id: row.user_id,
        title: clean(row.title),
        source_type: clean(row.source_type),
        address_text: clean(row.address_text),
        city: clean(row.city),
        state: clean(row.state),
        matched_venue_id: venueId,
      };
    })
    .filter((row) => row.matched_venue_id);

  console.log(
    JSON.stringify(
      {
        scanned: rows.length,
        matched: updates.length,
        apply,
        offset,
        limit,
      },
      null,
      2,
    ),
  );

  if (!updates.length) return;

  console.table(
    updates.slice(0, 25).map((row) => ({
      id: row.id,
      title: row.title,
      address_text: row.address_text,
      matched_venue_id: row.matched_venue_id,
    })),
  );

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to persist venue_id updates.");
    return;
  }

  for (const row of updates) {
    const { error: updateError } = await supabase
      .from("planner_events")
      .update({ venue_id: row.matched_venue_id })
      .eq("id", row.id)
      .is("venue_id", null);
    if (updateError) throw new Error(`Failed to update planner event ${row.id}: ${updateError.message}`);
  }

  console.log(`Applied ${updates.length} planner event venue backfill updates.`);
}

main().catch((error) => {
  console.error("[backfill_planner_event_venues] fatal", error);
  process.exit(1);
});
