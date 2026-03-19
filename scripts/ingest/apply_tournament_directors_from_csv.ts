import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

type CsvRow = Record<string, string>;

function clean(value: string | null | undefined) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!v) return null;
  if (v.toLowerCase() === "null") return null;
  return v;
}

function parseCsvLine(line: string) {
  // Minimal RFC4180-ish CSV line parser: handles quoted fields, escaped quotes, commas.
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        const next = line[i + 1];
        if (next === '"') {
          cur += '"';
          i++;
          continue;
        }
        inQuotes = false;
        continue;
      }
      cur += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(fileText: string) {
  const lines = fileText.split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return [] as CsvRow[];
  const header = parseCsvLine(lines[0]!).map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!);
    const row: CsvRow = {};
    for (let j = 0; j < header.length; j++) {
      const key = header[j]!;
      row[key] = (cols[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  const FILE_ARG = process.argv.find((arg) => arg.startsWith("--file="));
  const filePath = FILE_ARG ? FILE_ARG.split("=").slice(1).join("=") : "";
  const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
  const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split("=")[1])) : Infinity;

  if (!filePath) {
    throw new Error("Missing required arg: --file=/path/to/tournaments_director_research.csv");
  }

  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const text = fs.readFileSync(abs, "utf8");
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("CSV had no rows.");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let csvRows = 0;
  let eligible = 0;
  let skippedMissingId = 0;
  let skippedNoDirectorFields = 0;
  let updatedDirectorName = 0;
  let updatedDirectorEmail = 0;
  let notFoundOrNoop = 0;
  let errors = 0;
  const errorSamples: Array<{ id: string; message: string }> = [];

  for (const row of rows) {
    if (eligible >= LIMIT) break;
    csvRows += 1;

    const id = clean(row.id);
    if (!id) {
      skippedMissingId += 1;
      continue;
    }

    const directorName = clean(row.tournament_director);
    const directorEmail = clean(row.tournament_director_email);
    if (!directorName && !directorEmail) {
      skippedNoDirectorFields += 1;
      continue;
    }

    eligible += 1;

    if (!APPLY) continue;

    try {
      let changed = false;

      if (directorName) {
        const { data, error } = await supabase
          .from("tournaments" as any)
          .update({ tournament_director: directorName })
          .eq("id", id)
          .is("tournament_director", null)
          .select("id");
        if (error) throw error;
        if (Array.isArray(data) && data.length) {
          updatedDirectorName += 1;
          changed = true;
        }
      }

      if (directorEmail) {
        const { data, error } = await supabase
          .from("tournaments" as any)
          .update({ tournament_director_email: directorEmail.toLowerCase() })
          .eq("id", id)
          .is("tournament_director_email", null)
          .select("id");
        if (error) throw error;
        if (Array.isArray(data) && data.length) {
          updatedDirectorEmail += 1;
          changed = true;
        }
      }

      if (!changed) notFoundOrNoop += 1;
    } catch (err: any) {
      errors += 1;
      if (errorSamples.length < 10) {
        errorSamples.push({ id, message: err?.message ?? String(err) });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        file: abs,
        csvRows: rows.length,
        processedRows: csvRows,
        eligible,
        updatedDirectorName,
        updatedDirectorEmail,
        skippedMissingId,
        skippedNoDirectorFields,
        notFoundOrNoop,
        errors,
        errorSamples,
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

