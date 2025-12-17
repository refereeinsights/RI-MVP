import fs from "node:fs";
import path from "node:path";

import { DATA_DIR } from "./config";
import type { DryRunSeedResult, RunContext, TournamentRecord } from "./types";

export function appendRunLog(ctx: RunContext, message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  ctx.logLines.push(line);
  console.log(line);
}

export function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

const CSV_HEADER =
  "name,slug,sport,level,state,city,venue,address,start_date,end_date,referee_pay,referee_contact,source_url,source_domain,summary,status,confidence,run_id,updated_at";

function recordToCsvRow(record: TournamentRecord): string {
  const fields: (string | number | null | undefined)[] = [
    record.name,
    record.slug,
    record.sport,
    record.level ?? "",
    record.state ?? "",
    record.city ?? "",
    record.venue ?? "",
    record.address ?? "",
    record.start_date ?? "",
    record.end_date ?? "",
    record.referee_pay ?? "",
    record.referee_contact ?? "",
    record.source_url,
    record.source_domain,
    record.summary ?? "",
    record.status,
    record.confidence ?? "",
    record.run_id ?? "",
    record.updated_at ?? "",
  ];

  return fields
    .map((value) => {
      if (value === null || typeof value === "undefined") return "";
      const str = String(value);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    })
    .join(",");
}

function writeCsvFile(filePath: string, records: TournamentRecord[]) {
  const rows = [CSV_HEADER];
  records.forEach((record) => rows.push(recordToCsvRow(record)));
  fs.writeFileSync(filePath, rows.join("\n"), "utf8");
}

export async function writeDryRunOutputs(
  ctx: RunContext,
  seeds: DryRunSeedResult[]
) {
  ensureDir(ctx.runDir);
  const payload = {
    run_id: ctx.runId,
    dry_run: true,
    generated_at: ctx.timestampLabel,
    seeds,
  };

  const jsonPath = path.join(ctx.runDir, `dry_run_${ctx.runId}.json`);
  const logPath = path.join(ctx.runDir, `dry_run_${ctx.runId}.log`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(logPath, ctx.logLines.join("\n"), "utf8");
}

function addRunMetadata(
  records: TournamentRecord[],
  ctx: RunContext
): TournamentRecord[] {
  return records.map((record) => ({
    ...record,
    run_id: ctx.runId,
    updated_at: ctx.timestampLabel,
  }));
}

export async function writeRunOutputs(
  ctx: RunContext,
  confirmed: TournamentRecord[],
  unconfirmed: TournamentRecord[]
) {
  ensureDir(ctx.runDir);
  const confirmedWithMeta = addRunMetadata(confirmed, ctx);
  const unconfirmedWithMeta = addRunMetadata(unconfirmed, ctx);

  writeCsvFile(
    path.join(ctx.runDir, `confirmed_${ctx.runId}.csv`),
    confirmedWithMeta
  );
  writeCsvFile(
    path.join(ctx.runDir, `unconfirmed_${ctx.runId}.csv`),
    unconfirmedWithMeta
  );

  const summaryPath = path.join(ctx.runDir, `summary_${ctx.runId}.json`);
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        run_id: ctx.runId,
        generated_at: ctx.timestampLabel,
        confirmed: confirmedWithMeta.length,
        unconfirmed: unconfirmedWithMeta.length,
      },
      null,
      2
    ),
    "utf8"
  );

  updateRollingStore("rolling_confirmed_v2.json", confirmedWithMeta);
  updateRollingStore("rolling_unconfirmed_v2.json", unconfirmedWithMeta);
}

function updateRollingStore(filename: string, records: TournamentRecord[]) {
  const jsonPath = path.join(DATA_DIR, filename);
  const existing: Record<string, TournamentRecord> = {};
  if (fs.existsSync(jsonPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as TournamentRecord[];
      parsed.forEach((record) => {
        existing[record.slug] = record;
      });
    } catch {
      // ignore malformed file
    }
  }

  records.forEach((record) => {
    existing[record.slug] = record;
  });

  const merged = Object.values(existing);
  fs.writeFileSync(jsonPath, JSON.stringify(merged, null, 2), "utf8");

  const csvName = filename.replace(/\.json$/i, ".csv");
  writeCsvFile(path.join(DATA_DIR, csvName), merged);
}
