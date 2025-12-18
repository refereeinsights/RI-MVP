import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

import {
  cleanCsvRows,
  csvRowsToTournamentRows,
  importTournamentRecords,
  parseCsv,
} from "@/lib/tournaments/importUtils";
import type { TournamentSource, TournamentStatus } from "@/lib/types/tournament";

type CliOptions = {
  input: string;
  source: TournamentSource;
  status: TournamentStatus;
};

const DEFAULT_SOURCE: TournamentSource = "external_crawl";
const DEFAULT_STATUS: TournamentStatus = "draft";

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let input = "";
  let source: TournamentSource = DEFAULT_SOURCE;
  let status: TournamentStatus = DEFAULT_STATUS;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input" && args[i + 1]) {
      input = args[++i];
    } else if (arg === "--source" && args[i + 1]) {
      source = args[++i] as TournamentSource;
    } else if (arg === "--status" && args[i + 1]) {
      status = args[++i] as TournamentStatus;
    }
  }

  if (!input) {
    console.error(
      "Usage: npm run import-cleaned-tournaments -- --input <clean_csv> [--source external_crawl] [--status draft|published]"
    );
    process.exit(1);
  }

  return { input: path.resolve(input), source, status };
}

async function main() {
  const options = parseArgs();
  const csvText = await fs.readFile(options.input, "utf8");
  const { rows } = parseCsv(csvText);
  const { kept } = cleanCsvRows(rows);
  const records = csvRowsToTournamentRows(kept, { status: options.status, source: options.source });
  const result = await importTournamentRecords(records);

  console.log(`Processed ${records.length} tournaments.`);
  console.log(`Imported: ${result.success}`);
  if (result.failures.length) {
    console.log(`Failures (${result.failures.length}):`);
    result.failures.forEach((failure) => {
      console.log(` - ${failure.record.name}: ${failure.error}`);
    });
  }
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
