import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

import {
  cleanCsvRows,
  csvRowsToTournamentRows,
  importTournamentRecords,
  inferSportFromCsvRow,
  parseCsv,
} from "@/lib/tournaments/importUtils";
import { TOURNAMENT_SPORTS } from "@/lib/tournaments/sports";
import type { TournamentSource, TournamentStatus } from "@/lib/types/tournament";

// Env var: INTERNAL_API_SECRET — shared secret between this app and partner-mcp.
// Set the same value in both Vercel projects. Min 32 chars recommended.
function checkSecret(req: Request): boolean {
  const secret = (process.env.INTERNAL_API_SECRET ?? "").trim();
  if (!secret) return false;
  const header = (req.headers.get("x-internal-secret") ?? "").trim();
  if (!header || header.length !== secret.length) return false;
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(secret));
  } catch {
    return false;
  }
}

const VALID_STATUSES = new Set<TournamentStatus>(["draft", "published"]);
const VALID_SOURCES = new Set<TournamentSource>([
  "us_club_soccer",
  "cal_south",
  "gotsoccer",
  "soccerwire",
  "external_crawl",
  "public_submission",
]);

export async function POST(req: Request) {
  if (!checkSecret(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const csv = typeof body.csv === "string" ? body.csv.trim() : "";
  if (!csv) {
    return NextResponse.json({ ok: false, error: "csv required" }, { status: 400 });
  }

  const sourceRaw = typeof body.source === "string" ? body.source.trim() : "external_crawl";
  const source: TournamentSource = VALID_SOURCES.has(sourceRaw as TournamentSource)
    ? (sourceRaw as TournamentSource)
    : "external_crawl";

  const statusRaw = typeof body.status === "string" ? body.status.trim() : "draft";
  const status: TournamentStatus = VALID_STATUSES.has(statusRaw as TournamentStatus)
    ? (statusRaw as TournamentStatus)
    : "draft";

  const fallbackSportInput =
    typeof body.fallback_sport === "string" ? body.fallback_sport.trim().toLowerCase() : "soccer";
  const fallbackSport = (TOURNAMENT_SPORTS as readonly string[]).includes(fallbackSportInput)
    ? fallbackSportInput
    : "soccer";

  const fallbackState =
    typeof body.fallback_state === "string" ? body.fallback_state.trim().toUpperCase() || null : null;
  const fallbackCity =
    typeof body.fallback_city === "string" ? body.fallback_city.trim() || null : null;

  // Parse + clean (mirrors importTournamentsAction in admin/page.tsx)
  const { rows } = parseCsv(csv);
  const rowsWithFallback = rows.map((row) => {
    const current = String((row as any).sport ?? (row as any).tournament_sport ?? "").trim();
    if (current) return row;
    const inferred = inferSportFromCsvRow(row, { fallbackSport });
    return { ...row, sport: inferred || fallbackSport };
  });

  const { kept, dropped } = cleanCsvRows(rowsWithFallback);

  if (!kept.length) {
    const sample = dropped
      .slice(0, 3)
      .map((d) => `${d.row?.name || "row"}: ${d.reason}`)
      .join("; ");
    return NextResponse.json(
      {
        ok: false,
        error: "no_rows_kept",
        dropped: dropped.length,
        sample: sample || undefined,
      },
      { status: 422 }
    );
  }

  // Apply city/state fallbacks where missing
  const keptWithFallbacks = kept.map((row) => ({
    ...row,
    city: row.city || fallbackCity || row.city,
    state: row.state || fallbackState || row.state,
  }));

  const records = csvRowsToTournamentRows(keptWithFallbacks, {
    status,
    source,
    subType: "admin",
  });

  if (!records.length) {
    return NextResponse.json(
      { ok: false, error: "no_valid_records_after_transform" },
      { status: 422 }
    );
  }

  try {
    const result = await importTournamentRecords(records);

    // Full row-level error detail (no cap). Row numbers are not tracked
    // through parseCsv → cleanCsvRows, so only name + reason are available.
    const errors = result.failures.map((f) => ({
      name: f.record?.name ?? null,
      error: f.error,
    }));

    const droppedRows = dropped.map((d) => ({
      name: String((d.row as any)?.name ?? ""),
      reason: d.reason,
    }));

    return NextResponse.json({
      ok: true,
      success: result.success,
      failed: result.failures.length,
      new_count: result.newCount,
      existing_count: result.existingCount,
      venue_links_created: result.venue_links_created,
      venue_links_attempted: result.venue_links_attempted,
      venue_link_errors: result.venue_link_errors,
      dropped_by_cleaner: dropped.length,
      original_row_count: rowsWithFallback.length,
      errors: errors.length ? errors : undefined,
      dropped_rows: droppedRows.length ? droppedRows : undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "import_failed";
    console.error("[internal/tournaments/import] importTournamentRecords failed", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
