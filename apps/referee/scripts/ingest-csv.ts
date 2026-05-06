/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { TournamentRow, TournamentSource, TournamentStatus } from "../lib/types/tournament";
import { ingestTournamentCsvText } from "../lib/tournaments/csvIngest";

type CliOptions = {
  filePath: string;
  dryRun: boolean;
  defaultSource?: TournamentSource;
  defaultSport: TournamentRow["sport"];
  defaultStatus: TournamentStatus;
};

const KNOWN_SOURCES: TournamentSource[] = [
  "us_club_soccer",
  "cal_south",
  "gotsoccer",
  "soccerwire",
  "public_submission",
  "external_crawl",
];

const KNOWN_STATUSES: TournamentStatus[] = ["draft", "published", "stale", "archived"];

const KNOWN_SPORTS: TournamentRow["sport"][] = [
  "soccer",
  "futsal",
  "basketball",
  "baseball",
  "softball",
  "lacrosse",
  "volleyball",
  "football",
  "wrestling",
  "hockey",
  "other",
];

function usage(exitCode: number) {
  console.log(
    [
      "Usage: tsx scripts/ingest-csv.ts [options] <path-to-csv>",
      "",
      "Options:",
      "  --dry-run           Parse and show the rows without writing to Supabase",
      "  --source=<source>   Default TournamentSource (" + KNOWN_SOURCES.join("|") + ")",
      "  --sport=<sport>     Default sport (" + KNOWN_SPORTS.join("|") + ")",
      "  --status=<status>   Default status (draft|published|stale|archived)",
      "  --help              Show this help message",
      "",
      "CSV Requirements:",
      '  Must include columns for "name", "state", "source_url", and either "source" column or --source flag.',
      "  Optional columns: city, level, venue, address, start_date, end_date, summary, confidence, source_domain, source_event_id.",
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
  let defaultSource: TournamentSource | undefined;
  let defaultStatus: TournamentStatus = "draft";
  let defaultSport: TournamentRow["sport"] = "soccer";

  for (const arg of args) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--source=")) {
      const value = arg.split("=")[1]?.trim().toLowerCase();
      if (value && isValidSource(value)) {
        defaultSource = value;
      } else {
        console.error(`Unknown source "${value}". Expected one of: ${KNOWN_SOURCES.join(", ")}.`);
        process.exit(1);
      }
    } else if (arg.startsWith("--sport=")) {
      const value = arg.split("=")[1]?.trim().toLowerCase();
      if (value && isValidSport(value)) {
        defaultSport = value as TournamentRow["sport"];
      } else {
        console.error(`Unknown sport "${value}". Expected one of: ${KNOWN_SPORTS.join(", ")}.`);
        process.exit(1);
      }
    } else if (arg.startsWith("--status=")) {
      const value = arg.split("=")[1]?.trim().toLowerCase();
      if (value && isValidStatus(value)) {
        defaultStatus = value;
      } else {
        console.error(
          `Unknown status "${value}". Expected one of: ${KNOWN_STATUSES.join(", ")}.`
        );
        process.exit(1);
      }
    } else if (arg === "--help") {
      usage(0);
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

  return { filePath: fileArg, dryRun, defaultSource, defaultSport, defaultStatus };
}

function isValidSource(value: string): value is TournamentSource {
  return KNOWN_SOURCES.includes(value as TournamentSource);
}

function isValidStatus(value: string): value is TournamentStatus {
  return KNOWN_STATUSES.includes(value as TournamentStatus);
}

function isValidSport(value: string): value is TournamentRow["sport"] {
  return KNOWN_SPORTS.includes(value as TournamentRow["sport"]);
}

async function main() {
  const options = parseArgs();

  if (!fs.existsSync(options.filePath)) {
    console.error(`File not found: ${options.filePath}`);
    process.exit(1);
  }

  const csv = fs.readFileSync(options.filePath, "utf8");
  const result = await ingestTournamentCsvText({
    csvText: csv,
    defaults: {
      defaultSource: options.defaultSource,
      defaultSport: options.defaultSport,
      defaultStatus: options.defaultStatus,
    },
    dryRun: options.dryRun,
    includeSuccesses: options.dryRun,
  });

  if (result.failures.length) {
    console.warn("Skipped rows:");
    result.failures.forEach((failure) => console.warn(`  - ${failure.error}`));
    console.warn("");
  }

  result.warnings.forEach((warning) => console.warn(`Row ${warning.line}: ${warning.message}`));

  if (options.dryRun) {
    console.log(`Dry run: ${result.valid} valid rows parsed.`);
    if (result.successes?.length) {
      console.log(
        "Sample payload:",
        result.successes.slice(0, 3).map((row) => row.tournament)
      );
    }
    return;
  }

  if (!result.ok) {
    console.error("Nothing ingested.");
    process.exit(1);
  }

  console.log(`Done. ${result.upserted ?? 0}/${result.valid} rows ingested.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
