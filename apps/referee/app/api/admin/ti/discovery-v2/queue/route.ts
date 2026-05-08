import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ingestTournamentCsvText } from "@/lib/tournaments/csvIngest";
import type { TournamentRow } from "@/lib/types/tournament";
import { parseDiscoveryV2CsvChunk } from "@/lib/admin/tiDiscoveryV2Csv";

export const runtime = "nodejs";

type Body = {
  csv_run_id: string;
  dry_run?: boolean;
};

const SPORTS: TournamentRow["sport"][] = [
  "soccer",
  "futsal",
  "basketball",
  "baseball",
  "softball",
  "lacrosse",
  "volleyball",
  "football",
  "wrestling",
  "hockey",
  "other",
];

function isValidSport(value: string): value is TournamentRow["sport"] {
  return SPORTS.includes(value as TournamentRow["sport"]);
}

function isValidZip5(zip: string | null | undefined) {
  return /^\d{5}$/.test(String(zip ?? "").trim());
}

export async function POST(req: Request) {
  await requireAdmin();

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });

  const csvRunId = String(body.csv_run_id ?? "").trim();
  if (!csvRunId) return NextResponse.json({ ok: false, error: "csv_run_id is required" }, { status: 400 });

  const dryRun = Boolean(body.dry_run);

  // Atomic claim (draft|imported|imported_partial -> queued_to_uploads)
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("discovery_csv_runs" as any)
    .update({ status: "queued_to_uploads", import_started_at: new Date().toISOString() })
    .eq("id", csvRunId)
    .in("status", ["draft", "imported", "imported_partial"])
    .select("id,sport,master_csv")
    .maybeSingle();

  if (claimErr) return NextResponse.json({ ok: false, error: claimErr.message }, { status: 500 });
  if (!claimed) return NextResponse.json({ ok: false, error: "Run cannot be queued in its current status." }, { status: 409 });

  const sportRaw = String((claimed as any).sport ?? "").trim().toLowerCase();
  const sport: TournamentRow["sport"] = isValidSport(sportRaw) ? (sportRaw as any) : "soccer";
  const masterCsv = String((claimed as any).master_csv ?? "").trim();
  if (!masterCsv) {
    await supabaseAdmin
      .from("discovery_csv_runs" as any)
      .update({ status: "failed", import_finished_at: new Date().toISOString() })
      .eq("id", csvRunId);
    return NextResponse.json({ ok: false, error: "Run has no master_csv" }, { status: 400 });
  }

  // Hard guardrail: uploads ingestion requires valid ZIPs for venue-based planning features.
  // Discovery can attach rows with blank ZIPs (to be backfilled), but queueing must fail until fixed.
  const parsed = parseDiscoveryV2CsvChunk({ csvText: masterCsv, futureOnly: false });
  if (parsed.ok === false) {
    await supabaseAdmin
      .from("discovery_csv_runs" as any)
      .update({ status: "failed", import_finished_at: new Date().toISOString() })
      .eq("id", csvRunId);
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const missingZip = parsed.rows.filter((r) => !isValidZip5(r.venue_zip)).length;
  if (missingZip > 0) {
    await supabaseAdmin
      .from("discovery_csv_runs" as any)
      .update({ status: "draft", import_started_at: null })
      .eq("id", csvRunId);
    return NextResponse.json(
      {
        ok: false,
        error: `Run master CSV has ${missingZip} row(s) with missing/invalid venue_zip. Run ZIP backfill before queueing.`,
        missing_zip_rows: missingZip,
      },
      { status: 400 }
    );
  }

  const ingest = await ingestTournamentCsvText({
    csvText: masterCsv,
    defaults: {
      defaultSource: "external_crawl",
      defaultSport: sport,
      defaultStatus: "draft",
    },
    dryRun,
  });

  const upserted = ingest.upserted ?? 0;
  const failedCount = ingest.failures.length;
  const rejectedCount = ingest.invalid;

  const importStatus = !ingest.ok ? "failed" : failedCount > 0 ? "partial" : "ok";
  const runStatus = !ingest.ok ? "failed" : failedCount > 0 ? "imported_partial" : "imported";

  await supabaseAdmin
    .from("discovery_csv_run_upload_links" as any)
    .insert({
      csv_run_id: csvRunId,
      notice_text: dryRun
        ? `Dry run: parsed ${ingest.valid} valid row(s), would upsert ${upserted}.`
        : `Queued: upserted ${upserted}/${ingest.valid} valid row(s); ${failedCount} failed; ${rejectedCount} rejected.`,
      created_count: upserted,
      updated_count: 0,
      rejected_count: rejectedCount,
      failed_count: failedCount,
      import_status: importStatus,
      import_errors: ingest.failures.length ? ingest.failures : null,
      store_row_audit: false,
    });

  await supabaseAdmin
    .from("discovery_csv_runs" as any)
    .update({ status: runStatus, import_finished_at: new Date().toISOString() })
    .eq("id", csvRunId);

  return NextResponse.json({
    ok: true,
    csv_run_id: csvRunId,
    dry_run: dryRun,
    upserted,
    valid: ingest.valid,
    invalid: ingest.invalid,
    failures: ingest.failures.slice(0, 25),
    warnings: ingest.warnings.slice(0, 25),
    status: runStatus,
  });
}
