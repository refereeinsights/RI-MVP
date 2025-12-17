import fs from "node:fs";
import path from "node:path";

import type { CrawlSeed, RunContext } from "./types";

export const DATA_DIR = path.join(process.cwd(), "desktop", "ri_mvp", "tournaments");
export const RUNS_DIR = path.join(DATA_DIR, "runs");
export const SEEDS_PATH = path.join(DATA_DIR, "seeds.json");

export function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function loadSeeds(): CrawlSeed[] {
  if (!fs.existsSync(SEEDS_PATH)) {
    throw new Error(`Seeds file not found at ${SEEDS_PATH}`);
  }
  const raw = fs.readFileSync(SEEDS_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Seeds file must be an array");
  }
  return parsed.map((seed, idx) => {
    if (!seed || typeof seed.url !== "string" || typeof seed.sport !== "string") {
      throw new Error(`Invalid seed entry at index ${idx}`);
    }
    return {
      url: seed.url,
      sport: seed.sport.toLowerCase(),
      level: seed.level ?? null,
      notes: seed.notes ?? null,
    } as CrawlSeed;
  });
}

function formatPacificTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).formatToParts(date);

  const dictionary: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      dictionary[part.type] = part.value;
    }
  }

  const runId = `${dictionary.year}${dictionary.month}${dictionary.day}_${dictionary.hour}${dictionary.minute}${dictionary.second}_${dictionary.timeZoneName ?? "PT"}`;
  const label = `${dictionary.year}-${dictionary.month}-${dictionary.day} ${dictionary.hour}:${dictionary.minute}:${dictionary.second} ${dictionary.timeZoneName ?? "PT"}`;
  return { runId, label };
}

export function createRunContext({ dryRun }: { dryRun: boolean }): RunContext {
  ensureDir(DATA_DIR);
  ensureDir(RUNS_DIR);
  const { runId, label } = formatPacificTimestamp();
  const runDir = path.join(RUNS_DIR, runId);
  ensureDir(runDir);
  return {
    dryRun,
    runId,
    runDir,
    timestampLabel: label,
    logLines: [],
    slugRegistry: new Set<string>(),
  };
}
