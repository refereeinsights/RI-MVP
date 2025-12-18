import fs from "node:fs/promises";
import path from "node:path";

import { cleanCsvRows, parseCsv, type CsvRow } from "@/lib/tournaments/importUtils";

type CliOptions = {
  input: string;
  outCsv: string;
  outJson: string;
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let input = "";
  let outCsv = "";
  let outJson = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input" && args[i + 1]) {
      input = args[++i];
    } else if (arg === "--out" && args[i + 1]) {
      outCsv = args[++i];
    } else if (arg === "--out-json" && args[i + 1]) {
      outJson = args[++i];
    }
  }

  if (!input) {
    console.error(
      "Usage: tsx scripts/tournament-crawl/clean-unconfirmed.ts --input <file> [--out <csv>] [--out-json <json>]"
    );
    process.exit(1);
  }

  const resolvedInput = path.resolve(input);
  const baseOut =
    outCsv && outCsv.length > 0
      ? path.resolve(outCsv)
      : path.join(path.dirname(resolvedInput), `clean_${path.basename(resolvedInput)}`);

  const resolvedJson =
    outJson && outJson.length > 0
      ? path.resolve(outJson)
      : baseOut.replace(/\.csv$/i, ".json");

  return { input: resolvedInput, outCsv: baseOut, outJson: resolvedJson };
}

function encodeCsvValue(value: string | null | undefined): string {
  const stringValue = value ?? "";
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

async function writeCsv(filePath: string, headers: string[], rows: CsvRow[]) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((header) => encodeCsvValue(row[header]));
    lines.push(values.join(","));
  }
  await fs.writeFile(filePath, lines.join("\n"), "utf8");
}

async function main() {
  const options = parseArgs();
  const csvText = await fs.readFile(options.input, "utf8");
  const { headers, rows } = parseCsv(csvText);

  if (!headers.length) {
    console.error("No headers found in CSV.");
    process.exit(1);
  }

  const { kept, dropped } = cleanCsvRows(rows);

  await writeCsv(options.outCsv, headers, kept);
  await fs.writeFile(options.outJson, JSON.stringify(kept, null, 2), "utf8");

  const summaryLines = [
    `Input rows: ${rows.length}`,
    `Kept rows: ${kept.length}`,
    `Dropped rows: ${dropped.length}`,
  ];

  const dropCounts = dropped.reduce<Record<string, number>>((acc, item) => {
    acc[item.reason] = (acc[item.reason] ?? 0) + 1;
    return acc;
  }, {});

  Object.entries(dropCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([reason, count]) => {
      summaryLines.push(`  - ${reason}: ${count}`);
    });

  const summaryPath = options.outCsv.replace(/\.csv$/i, ".summary.txt");
  await fs.writeFile(summaryPath, summaryLines.join("\n"), "utf8");

  console.log(summaryLines.join("\n"));
  console.log(`Clean CSV written to ${options.outCsv}`);
  console.log(`Clean JSON written to ${options.outJson}`);
  console.log(`Summary written to ${summaryPath}`);
}

main().catch((error) => {
  console.error("Failed to clean unconfirmed file:", error);
  process.exit(1);
});
