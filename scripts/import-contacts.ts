/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CliOptions = {
  filePath: string;
  dryRun: boolean;
};

type CsvRecord = {
  line: number;
  data: Record<string, string>;
};

type ContactKind = "tournament" | "referee";

function usage(exitCode: number) {
  console.log(
    [
      "Usage: tsx scripts/import-contacts.ts [--dry-run] <path-to-csv>",
      "",
      "CSV requirements:",
      '  - Must include a "kind" column with values: tournament | referee',
      '  - Tournament rows may include "tournament_id" or "tournament_slug"',
      "  - Optional columns:",
      "      type, name, email, phone, source_url, confidence, status, notes",
      "      organization, role, state, city",
      "",
      "Examples:",
      "  tsx scripts/import-contacts.ts ./contacts.csv",
      "  tsx scripts/import-contacts.ts --dry-run ./contacts.csv",
    ].join("\n")
  );
  process.exit(exitCode);
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help")) {
    usage(args.includes("--help") ? 0 : 1);
  }

  let fileArg: string | undefined;
  let dryRun = false;

  for (const arg of args) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--")) {
      console.error(`Unknown flag "${arg}".`);
      usage(1);
    } else if (!fileArg) {
      fileArg = path.resolve(arg);
    } else {
      console.error(`Unexpected positional argument "${arg}".`);
      usage(1);
    }
  }

  if (!fileArg) {
    console.error("Missing CSV path.");
    usage(1);
  }

  if (!fs.existsSync(fileArg)) {
    console.error(`CSV file not found: ${fileArg}`);
    process.exit(1);
  }

  return { filePath: fileArg, dryRun };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  const input = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
      continue;
    }

    currentField += char;
  }

  if (currentField.length || currentRow.length) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((value) => value.trim().length > 0));
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function rowsToRecords(rows: string[][]): CsvRecord[] {
  if (!rows.length) return [];

  const header = rows[0].map(normalizeHeader);
  const records: CsvRecord[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || !row.some((value) => value && value.trim().length > 0)) continue;

    const data: Record<string, string> = {};
    header.forEach((key, idx) => {
      data[key] = row[idx]?.trim() ?? "";
    });

    records.push({ line: i + 1, data });
  }

  return records;
}

async function resolveTournamentId(
  slugOrId: string | undefined
): Promise<string | null> {
  if (!slugOrId) return null;
  const value = slugOrId.trim();
  if (!value) return null;
  if (value.includes("-") && value.length > 30) {
    // looks like uuid
    return value;
  }

  const { data, error } = await supabaseAdmin
    .from("tournaments")
    .select("id")
    .eq("slug", value)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    throw error;
  }
  return data?.id ?? null;
}

async function main() {
  const options = parseArgs();
  const csvText = fs.readFileSync(options.filePath, "utf8");
  const records = rowsToRecords(parseCsv(csvText));

  if (!records.length) {
    console.log("No records found in CSV.");
    return;
  }

  let tournamentCount = 0;
  let refereeCount = 0;

  for (const record of records) {
    const kindValue = record.data.kind?.toLowerCase();
    if (!kindValue || !["tournament", "referee"].includes(kindValue)) {
      console.warn(`Line ${record.line}: skipping unknown kind "${record.data.kind}".`);
      continue;
    }
    const kind = kindValue as ContactKind;

    if (kind === "tournament") {
      const tournamentId =
        record.data.tournament_id || (await resolveTournamentId(record.data.tournament_slug));
      const payload = {
        tournament_id: tournamentId,
        type: (record.data.type?.toLowerCase() as any) ?? "general",
        status: (record.data.status?.toLowerCase() as any) ?? "pending",
        name: record.data.name || null,
        email: record.data.email || null,
        phone: record.data.phone || null,
        source_url: record.data.source_url || null,
        notes: record.data.notes || null,
        confidence: record.data.confidence ? Number(record.data.confidence) : null,
      };

      if (!options.dryRun) {
        const { error } = await supabaseAdmin.from("tournament_contacts").insert(payload);
        if (error) {
          console.error(`Line ${record.line}: failed to insert tournament contact`, error.message);
          continue;
        }
      }
      tournamentCount += 1;
    } else {
      const payload = {
        name: record.data.name || null,
        organization: record.data.organization || null,
        role: record.data.role || null,
        email: record.data.email || null,
        phone: record.data.phone || null,
        state: record.data.state || null,
        city: record.data.city || null,
        notes: record.data.notes || null,
        source_url: record.data.source_url || null,
      };
      if (!options.dryRun) {
        const { error } = await supabaseAdmin.from("referee_contacts").insert(payload);
        if (error) {
          console.error(`Line ${record.line}: failed to insert referee contact`, error.message);
          continue;
        }
      }
      refereeCount += 1;
    }
  }

  console.log(
    options.dryRun
      ? `[DRY-RUN] Processed ${tournamentCount} tournament contacts and ${refereeCount} referee contacts.`
      : `Inserted ${tournamentCount} tournament contacts and ${refereeCount} referee contacts.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
