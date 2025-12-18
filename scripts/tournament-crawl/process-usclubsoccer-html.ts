import fs from "node:fs/promises";
import path from "node:path";

import {
  extractHtmlFromMhtml,
  extractUSClubTournamentsFromHtml,
  type TournamentRow,
} from "@/lib/tournaments/importUtils";

import type { TournamentStatus } from "@/lib/types/tournament";

function parseArgs() {
  const args = process.argv.slice(2);
  let input = "";
  let sport: TournamentRow["sport"] = "soccer";
  let level = "national";
  let status: TournamentStatus = "draft";
  let outCsv = "";
  let outJson = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input" && args[i + 1]) {
      input = args[++i];
    } else if (arg === "--sport" && args[i + 1]) {
      const value = args[++i].toLowerCase();
      if (value === "soccer" || value === "football" || value === "basketball") {
        sport = value;
      }
    } else if (arg === "--level" && args[i + 1]) {
      level = args[++i];
    } else if (arg === "--status" && args[i + 1]) {
      const candidate = args[++i] as TournamentStatus;
      status = candidate;
    } else if (arg === "--out" && args[i + 1]) {
      outCsv = args[++i];
    } else if (arg === "--out-json" && args[i + 1]) {
      outJson = args[++i];
    }
  }

  if (!input) {
    console.error(
      "Usage: tsx scripts/tournament-crawl/process-usclubsoccer-html.ts --input <file> [--sport soccer|football|basketball] [--level text] [--status draft|published]"
    );
    process.exit(1);
  }

  const resolvedInput = path.resolve(input);
  const baseName = `usclubsoccer_processed_${path.basename(resolvedInput, path.extname(resolvedInput))}.csv`;
  const resolvedOutCsv = outCsv ? path.resolve(outCsv) : path.join(path.dirname(resolvedInput), baseName);
  const resolvedOutJson = outJson ? path.resolve(outJson) : resolvedOutCsv.replace(/\.csv$/i, ".json");

  return { input: resolvedInput, sport, level, status, outCsv: resolvedOutCsv, outJson: resolvedOutJson };
}

function encodeCsvValue(value: string | null | undefined) {
  const stringValue = value ?? "";
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

async function writeCsv(filePath: string, headers: string[], rows: TournamentRow[]) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((header) => encodeCsvValue((row as Record<string, any>)[header]));
    lines.push(values.join(","));
  }
  await fs.writeFile(filePath, lines.join("\n"), "utf8");
}

async function main() {
  const options = parseArgs();
  let html = await fs.readFile(options.input, "utf8");
  if (options.input.toLowerCase().endsWith(".mhtml")) {
    html = extractHtmlFromMhtml(html);
  }

  const records = extractUSClubTournamentsFromHtml(html, {
    sport: options.sport,
    level: options.level,
    status: options.status,
    source: "us_club_soccer",
  });

  const headers = [
    "name",
    "slug",
    "sport",
    "level",
    "state",
    "city",
    "venue",
    "address",
    "start_date",
    "end_date",
    "source_url",
    "source_domain",
    "status",
  ];

  await writeCsv(options.outCsv, headers, records);
  await fs.writeFile(options.outJson, JSON.stringify(records, null, 2), "utf8");

  console.log(`Extracted ${records.length} tournaments.`);
  console.log(`CSV written to ${options.outCsv}`);
  console.log(`JSON written to ${options.outJson}`);
}

main().catch((error) => {
  console.error("Failed to process US Club Soccer HTML:", error);
  process.exit(1);
});
