import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

type CsvRow = Record<string, string>;

function clean(value: string | null | undefined) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
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

function normalizeUrl(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  try {
    return new URL(raw).toString();
  } catch {
    try {
      return new URL(`https://${raw}`).toString();
    } catch {
      return null;
    }
  }
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  const FILE_ARG = process.argv.find((arg) => arg.startsWith("--file="));
  const filePath = FILE_ARG ? FILE_ARG.split("=").slice(1).join("=") : "";
  const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
  const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split("=")[1])) : Infinity;

  if (!filePath) {
    throw new Error("Missing required arg: --file=/path/to/tournaments_with_urls.csv");
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

  let totalRows = 0;
  let totalEligible = 0;
  let totalUpdated = 0;
  let totalSkippedAlreadyHasOfficial = 0;
  let totalSkippedMissingOfficialInCsv = 0;
  let totalSkippedMissingId = 0;
  let totalInvalidUrl = 0;
  let totalNotFoundOrNoop = 0;
  let totalErrors = 0;
  const errorSamples: Array<{ id: string; message: string }> = [];

  const updatedIds: string[] = [];

  for (const row of rows) {
    if (totalEligible >= LIMIT) break;
    totalRows++;
    const id = clean(row.id);
    if (!id) {
      totalSkippedMissingId++;
      continue;
    }

    const officialFromCsv = clean(row.official_website_url) ?? clean((row as any).official_url);
    if (!officialFromCsv) {
      totalSkippedMissingOfficialInCsv++;
      continue;
    }
    const officialUrl = normalizeUrl(officialFromCsv);
    if (!officialUrl) {
      totalInvalidUrl++;
      continue;
    }

    totalEligible++;

    if (!APPLY) continue;

    try {
      const { data, error } = await supabase
        .from("tournaments" as any)
        .update({ official_website_url: officialUrl })
        .eq("id", id)
        .is("official_website_url", null)
        .select("id");

      if (error) {
        totalErrors++;
        if (errorSamples.length < 10) errorSamples.push({ id, message: error.message ?? String(error) });
        continue;
      }

      if (Array.isArray(data) && data.length > 0) {
        totalUpdated++;
        updatedIds.push(id);
      } else {
        // Either tournament not found, or it already had official_website_url set.
        totalNotFoundOrNoop++;
      }
    } catch {
      totalErrors++;
    }
  }

  // Best-effort: count how many rows were skipped due to already having official urls.
  // Only compute this after apply to avoid extra reads.
  if (APPLY) {
    try {
      const ids = rows
        .map((r) => clean(r.id))
        .filter(Boolean)
        .slice(0, 5000) as string[];
      if (ids.length) {
        const { data } = await supabase
          .from("tournaments" as any)
          .select("id,official_website_url")
          .in("id", ids);
        const byId = new Map<string, string | null>((data ?? []).map((r: any) => [r.id, r.official_website_url ?? null]));
        for (const id of ids) {
          if (updatedIds.includes(id)) continue;
          const v = clean(byId.get(id) ?? null);
          if (v) totalSkippedAlreadyHasOfficial++;
        }
      }
    } catch {
      // Ignore.
    }
  }

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        file: abs,
        csvRows: rows.length,
        processedRows: totalRows,
        eligibleWithIdAndUrl: totalEligible,
        updated: totalUpdated,
        skippedMissingId: totalSkippedMissingId,
        skippedMissingOfficialInCsv: totalSkippedMissingOfficialInCsv,
        skippedAlreadyHasOfficial: totalSkippedAlreadyHasOfficial,
        invalidUrl: totalInvalidUrl,
        notFoundOrNoop: totalNotFoundOrNoop,
        errors: totalErrors,
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
