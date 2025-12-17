#!/usr/bin/env node
import process from "node:process";

import { createRunContext, loadSeeds } from "./config";
import { runAdapter } from "./adapters";
import type { DryRunSeedResult, TournamentRecord } from "./types";
import { appendRunLog, writeDryRunOutputs, writeRunOutputs } from "./storage";

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;

  for (const arg of args) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help") {
      printUsage(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printUsage(1);
    }
  }

  return { dryRun };
}

function printUsage(exitCode: number) {
  console.log(
    [
      "Usage: npm run tournament-crawl [-- --dry-run]",
      "",
      "--dry-run   Fetch listing pages, discover detail URLs, no writes",
    ].join("\n")
  );
  process.exit(exitCode);
}

async function main() {
  const { dryRun } = parseArgs();
  const ctx = createRunContext({ dryRun });
  const seeds = loadSeeds();

  appendRunLog(
    ctx,
    `Starting tournament crawl run ${ctx.runId} (${dryRun ? "dry-run" : "full"})`
  );

  const dryRunResults: DryRunSeedResult[] = [];
  const confirmed: TournamentRecord[] = [];
  const unconfirmed: TournamentRecord[] = [];

  for (const seed of seeds) {
    appendRunLog(ctx, `Processing seed ${seed.url}`);
    try {
      const result = await runAdapter(seed, ctx);
      if (ctx.dryRun) {
        if (result.dryRunResult) {
          dryRunResults.push(result.dryRunResult);
        }
      } else {
        confirmed.push(...result.confirmed);
        unconfirmed.push(...result.unconfirmed);
      }
    } catch (error) {
      appendRunLog(
        ctx,
        `Failed to process seed ${seed.url}: ${(error as Error).message}`
      );
    }
  }

  if (ctx.dryRun) {
    await writeDryRunOutputs(ctx, dryRunResults);
    appendRunLog(ctx, `Dry-run complete for ${ctx.runId}`);
  } else {
    await writeRunOutputs(ctx, confirmed, unconfirmed);
    appendRunLog(
      ctx,
      `Run complete. Confirmed: ${confirmed.length}, Unconfirmed: ${unconfirmed.length}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
