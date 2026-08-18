import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../../");

function source(path: string) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("tournament-only trust is issued by the shared tournament CTA builder and verified at handoff", () => {
  const builder = source("apps/ti-web/lib/affiliates/tournamentTravelLinks.ts");
  const route = source("apps/ti-web/app/go/hotels/route.ts");
  assert.match(builder, /issueTournamentHotelContext\(args\.tournamentId\)/);
  assert.match(builder, /qp\.set\("tournament_context", tournamentContext\)/);
  assert.match(route, /verifyTournamentHotelContext\(tournamentContext, requestedTournamentId\)/);
  assert.match(route, /tournamentContextTrusted: verifiedTournamentContext\.ok/);
});

test("all existing tournament-only card surfaces use the shared trusted hotel-link builder", () => {
  for (const path of [
    "apps/ti-web/app/tournaments/page.tsx",
    "apps/ti-web/app/tournaments/_components/SportHubPage.tsx",
    "apps/ti-web/app/[sport]/[state]/page.tsx",
    "apps/ti-web/app/[sport]/[state]/[metro]/page.tsx",
    "apps/ti-web/app/youth-sports-tournaments/june-2026/page.tsx",
  ]) {
    assert.match(source(path), /buildTournamentHotelsHref\(/, path);
  }
});

test("Tournament Hotels propagates context only for its no-venue handoff", () => {
  const page = source("apps/ti-web/app/tournaments/[slug]/hotels/page.tsx");
  const client = source("apps/ti-web/app/tournaments/[slug]/hotels/TournamentHotelsClient.tsx");
  assert.match(page, /issueTournamentHotelContext\(tournament\.id\)/);
  assert.match(client, /if \(!selectedVenue && tournamentContext\)/);
  assert.match(client, /url\.searchParams\.set\("tournament_context", tournamentContext\)/);
});

test("generic Planner and Book Travel clients do not issue tournament trust context", () => {
  assert.doesNotMatch(source("apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx"), /tournament_context/);
  assert.doesNotMatch(source("apps/ti-web/app/book-travel/BookTravelTeamBlockForm.tsx"), /tournament_context/);
});
