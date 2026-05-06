import fs from "node:fs";
import path from "node:path";

type CsvRow = Record<string, string>;

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function parseCsv(contents: string): { header: string[]; rows: CsvRow[] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;

  function pushCell() {
    row.push(cur);
    cur = "";
  }
  function pushRow() {
    rows.push(row);
    row = [];
  }

  while (i < contents.length) {
    const ch = contents[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = contents[i + 1];
        if (next === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cur += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushCell();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushCell();
      pushRow();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }

  if (cur.length || row.length) {
    pushCell();
    pushRow();
  }

  const header = (rows[0] ?? []).map((h) => h.trim());
  const out: CsvRow[] = [];
  for (const r of rows.slice(1)) {
    if (r.every((c) => !String(c ?? "").trim())) continue;
    const obj: CsvRow = {};
    for (let idx = 0; idx < header.length; idx += 1) obj[header[idx]] = String(r[idx] ?? "");
    out.push(obj);
  }
  return { header, rows: out };
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fileMtimeIso(filePath: string) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function actionRank(action: string) {
  const a = action.trim();
  if (a === "updated" || a === "updated_existing_2027") return 4;
  if (a === "needs_review") return 3;
  if (a === "no_2027_found") return 2;
  if (a === "failed_url") return 1;
  return 0;
}

function pickBetter(existing: CsvRow & { __mtime: string }, incoming: CsvRow & { __mtime: string }) {
  const rE = actionRank(existing.update_action ?? "");
  const rI = actionRank(incoming.update_action ?? "");
  if (rI !== rE) return rI > rE ? incoming : existing;
  return incoming.__mtime > existing.__mtime ? incoming : existing;
}

function listFilesFromArgs(): string[] {
  const filesArg = clean(argValue("files"));
  if (!filesArg) return [];
  return filesArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => path.resolve(process.cwd(), p));
}

async function main() {
  const out = clean(argValue("out")) ?? path.resolve(process.cwd(), "tmp", `season_scan_merged_${Date.now()}.csv`);
  const files = listFilesFromArgs();
  if (files.length === 0) throw new Error("Missing --files=tmp/a.csv,tmp/b.csv,...");

  let header: string[] | null = null;
  const merged = new Map<string, CsvRow & { __mtime: string }>();
  let readRows = 0;

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    const { header: h, rows } = parseCsv(fs.readFileSync(filePath, "utf8"));
    if (!header) header = h;
    const mtime = fileMtimeIso(filePath);
    for (const r of rows) {
      readRows += 1;
      const tournamentId = String(r.tournament_id ?? "").trim();
      const seasonYear = String(r.new_season_year ?? r.season_year ?? "").trim() || "2027";
      const key = `${tournamentId}:${seasonYear}`;
      const withMeta = Object.assign({}, r, { __mtime: mtime });
      const existing = merged.get(key);
      merged.set(key, existing ? pickBetter(existing, withMeta) : withMeta);
    }
  }

  const outHeader = header ?? [];
  const rows = Array.from(merged.values());
  rows.sort((a, b) => {
    const at = (a.tournament_id ?? "").localeCompare(b.tournament_id ?? "");
    if (at !== 0) return at;
    return String(a.new_season_year ?? a.season_year ?? "").localeCompare(String(b.new_season_year ?? b.season_year ?? ""));
  });

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${outHeader.join(",")}\n`, "utf8");
  for (const r of rows) {
    const record = outHeader.map((k) => csvCell((r as any)[k]));
    fs.appendFileSync(out, `${record.join(",")}\n`, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        files: files.map((f) => path.relative(process.cwd(), f)),
        read_rows: readRows,
        unique_rows: rows.length,
        out: path.relative(process.cwd(), out),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

