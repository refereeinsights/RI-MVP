import fs from "fs";
import path from "path";

// if scripts/cron is at repoRoot/scripts/cron and lib is at repoRoot/lib
import { parseUSClubSoccer } from "../../lib/parsers/usClubSoccer";
import { upsertTournamentFromSource } from "../../lib/tournaments/upsertFromSource";

async function main() {
  const html = fs.readFileSync(
    path.join(process.cwd(), "fixtures/usclub.html"),
    "utf-8"
  );

  const tournaments = parseUSClubSoccer(html);

  let success = 0;
  let failed = 0;

  for (const t of tournaments) {
    try {
      await upsertTournamentFromSource(t);
      success++;
    } catch (err) {
      failed++;
      console.error("Failed ingest:", t.name, err);
    }
  }

  console.log({ source: "us_club_soccer", total: tournaments.length, success, failed });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
