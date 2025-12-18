import fs from "node:fs/promises";
import path from "node:path";

type CsvRow = Record<string, string>;

type ParsedCsv = {
  headers: string[];
  rows: CsvRow[];
};

const ALLOWED_SPORTS = new Map<string, string>([
  ["soccer", "soccer"],
  ["football", "football"],
  ["basketball", "basketball"],
]);

const OTHER_SPORT_KEYWORDS = [
  "volleyball",
  "lacrosse",
  "softball",
  "baseball",
  "wrestling",
  "swim",
  "swimming",
  "tennis",
  "golf",
  "track",
  "cross country",
  "rugby",
  "pickleball",
  "dance",
  "rowing",
  "crew",
  "cheer",
  "cricket",
  "field hockey",
  "martial arts",
  "karate",
  "taekwondo",
  "hockey",
];

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
    console.error("Usage: tsx scripts/tournament-crawl/clean-unconfirmed.ts --input <file> [--out <csv>] [--out-json <json>]");
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

function parseCsv(text: string): ParsedCsv {
  const headers: string[] = [];
  const rows: CsvRow[] = [];

  const currentField: string[] = [];
  const currentRow: string[] = [];
  let insideQuotes = false;

  const pushField = () => {
    currentRow.push(currentField.join(""));
    currentField.length = 0;
  };

  const pushRow = () => {
    if (!currentRow.length) return;
    if (!headers.length) {
      headers.push(...currentRow);
    } else {
      const row: CsvRow = {};
      headers.forEach((header, index) => {
        row[header] = currentRow[index] ?? "";
      });
      const hasContent = Object.values(row).some((value) => value && value.trim().length > 0);
      if (hasContent) {
        rows.push(row);
      }
    }
    currentRow.length = 0;
  };

  const chars = text.split("");
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const nextChar = chars[i + 1];
    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField.push('"');
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }
    if (char === "," && !insideQuotes) {
      pushField();
      continue;
    }
    if ((char === "\n" || char === "\r") && !insideQuotes) {
      pushField();
      pushRow();
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      continue;
    }
    currentField.push(char);
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    pushField();
    pushRow();
  }

  return { headers, rows };
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

function normalizeWhitespace(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function referencesOtherSports(text: string) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return OTHER_SPORT_KEYWORDS.some((keyword) => lower.includes(keyword));
}

type Evaluation = { keep: boolean; reason?: string; normalized?: CsvRow };

function evaluateRow(row: CsvRow): Evaluation {
  const name = normalizeWhitespace(row.name);
  if (!name) {
    return { keep: false, reason: "missing name" };
  }
  if (name.length > 180) {
    return { keep: false, reason: "name too long / likely aggregate row" };
  }

  const slug = (row.slug ?? "").trim();
  if (!slug) {
    return { keep: false, reason: "missing slug" };
  }

  const rawSport = (row.sport ?? "").toLowerCase().trim();
  const sport = ALLOWED_SPORTS.get(rawSport);
  if (!sport) {
    return { keep: false, reason: `unsupported sport "${row.sport ?? ""}"` };
  }

  const state = normalizeWhitespace(row.state);
  const city = normalizeWhitespace(row.city);
  if (!state && !city) {
    return { keep: false, reason: "missing city/state" };
  }

  const sourceUrl = normalizeWhitespace(row.source_url);
  if (!sourceUrl) {
    return { keep: false, reason: "missing source URL" };
  }

  const summary = normalizeWhitespace(row.summary);
  const combined = `${name} ${summary}`.toLowerCase();
  if (referencesOtherSports(combined)) {
    return { keep: false, reason: "references other sport" };
  }

  const normalized: CsvRow = {
    ...row,
    name,
    slug,
    sport,
    state,
    city,
    summary,
    source_url: sourceUrl,
  };

  return { keep: true, normalized };
}

async function main() {
  const options = parseArgs();
  const csvText = await fs.readFile(options.input, "utf8");
  const { headers, rows } = parseCsv(csvText);

  if (!headers.length) {
    console.error("No headers found in CSV.");
    process.exit(1);
  }

  const kept: CsvRow[] = [];
  const dropped: { row: CsvRow; reason: string }[] = [];
  const seenSlugs = new Set<string>();

  for (const row of rows) {
    const evaluation = evaluateRow(row);
    if (!evaluation.keep || !evaluation.normalized) {
      dropped.push({ row, reason: evaluation.reason ?? "filtered" });
      continue;
    }
    const slugKey = evaluation.normalized.slug.toLowerCase();
    if (seenSlugs.has(slugKey)) {
      dropped.push({ row, reason: "duplicate slug" });
      continue;
    }
    seenSlugs.add(slugKey);
    kept.push(evaluation.normalized);
  }

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
