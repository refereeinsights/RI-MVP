import { getAsaAzUrl, sweepAsaAzSanctionedClubTournaments } from "@/server/sweeps/asaAzSanctionedClubTournaments";

async function main() {
  const url = getAsaAzUrl();
  const resp = await fetch(url, { headers: { "user-agent": "RI-ASA-Smoke/1.0" } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ASA URL: ${resp.status}`);
  }
  const html = await resp.text();
  const writeDb = process.env.WRITE_DB === "true";
  const result = await sweepAsaAzSanctionedClubTournaments({
    html,
    status: "draft",
    writeDb,
  });

  console.log("ASA sweep counts", result.counts);
  console.log("ASA sweep sample", result.sample.map((row) => ({
    name: row.tournament_name,
    website: row.tournament_website_url,
  })));

  if (result.counts.found < 1) {
    throw new Error("No tournaments found in ASA sweep.");
  }
  if (result.counts.with_website < 1) {
    throw new Error("No tournament website URLs found in ASA sweep.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
