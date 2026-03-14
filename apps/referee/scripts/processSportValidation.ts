#!/usr/bin/env ts-node
import { runSportValidationBatch } from "../src/server/validation/sportValidation";

async function main() {
  const limit = Number(process.env.LIMIT ?? "200");
  const res = await runSportValidationBatch(limit);
  console.log(
    JSON.stringify(
      {
        processed: res.processed,
        conflicts: res.conflicts,
        skipped: res.skipped,
        limit,
      },
      null,
      2
    )
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
