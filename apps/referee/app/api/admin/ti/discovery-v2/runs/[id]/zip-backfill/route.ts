import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { geocodeAddressMapbox } from "@/lib/mapbox/geocodeAddress";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildMasterCsv, parseDiscoveryV2CsvChunk } from "@/lib/admin/tiDiscoveryV2Csv";

export const runtime = "nodejs";

type Body = {
  max?: number; // default 50
};

const DEFAULT_MAX = 50;
const ABSOLUTE_MAX = 50;

function isValidZip5(zip: string | null | undefined) {
  return /^\d{5}$/.test(String(zip ?? "").trim());
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await ctx.params;
  const runId = String(id ?? "").trim();
  if (!runId) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Body | null;
  const maxRequested = body?.max != null ? Number(body.max) : DEFAULT_MAX;
  const max = Number.isFinite(maxRequested) ? Math.max(1, Math.min(ABSOLUTE_MAX, Math.floor(maxRequested))) : DEFAULT_MAX;

  const { data: run, error: runErr } = await supabaseAdmin
    .from("discovery_csv_runs" as any)
    .select("id,status,master_csv")
    .eq("id", runId)
    .maybeSingle();
  if (runErr) return NextResponse.json({ ok: false, error: runErr.message }, { status: 500 });
  if (!run) return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
  if (String((run as any).status ?? "") !== "draft") {
    return NextResponse.json({ ok: false, error: "Run is not editable in current status (must be draft)." }, { status: 409 });
  }

  const masterCsv = String((run as any).master_csv ?? "").trim();
  if (!masterCsv) return NextResponse.json({ ok: false, error: "Run has no master_csv" }, { status: 400 });

  const parsed = parseDiscoveryV2CsvChunk({ csvText: masterCsv, futureOnly: false });
  if (parsed.ok === false) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const token = String(process.env.MAPBOX_ACCESS_TOKEN ?? "").trim();
  if (!token) return NextResponse.json({ ok: false, error: "Missing MAPBOX_ACCESS_TOKEN" }, { status: 500 });

  const rows = parsed.rows;
  const targets = rows
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => !isValidZip5(row.venue_zip));

  const attempted = Math.min(max, targets.length);
  let filled = 0;
  let geocoded = 0;
  let skipped = 0;

  const warnings: string[] = [];

  for (let i = 0; i < attempted; i += 1) {
    const { row } = targets[i]!;
    const parts = [row.venue_address, row.venue_city, row.venue_state].filter(Boolean);
    if (parts.length < 2) {
      skipped += 1;
      continue;
    }
    const geo = await geocodeAddressMapbox(parts.join(", "), token, { expectedState: row.venue_state });
    if (!geo) {
      warnings.push(`zip_backfill_failed:${row.tournament_name}:${row.venue_city},${row.venue_state}`);
      continue;
    }
    geocoded += 1;

    const zip = String(geo.zip ?? "").trim();
    if (isValidZip5(zip)) {
      row.venue_zip = zip;
      filled += 1;
    } else {
      warnings.push(`zip_not_found:${row.tournament_name}:${row.venue_city},${row.venue_state}`);
    }

    if (row.venue_latitude == null && Number.isFinite(geo.lat)) row.venue_latitude = geo.lat;
    if (row.venue_longitude == null && Number.isFinite(geo.lng)) row.venue_longitude = geo.lng;
  }

  const rebuilt = buildMasterCsv(rows);
  await supabaseAdmin
    .from("discovery_csv_runs" as any)
    .update({ master_csv: rebuilt.csv, master_csv_row_count: rebuilt.rowCount })
    .eq("id", runId);

  return NextResponse.json({
    ok: true,
    csv_run_id: runId,
    attempted,
    filled,
    geocoded,
    skipped,
    remaining_missing_zip: Math.max(0, targets.length - attempted),
    master_csv_row_count: rebuilt.rowCount,
    warnings: warnings.slice(0, 50),
  });
}

