import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  normalizePublicTournamentSlug,
  normalizeTournamentDirectoryPage,
  TOURNAMENT_DIRECTORY_PAGE_SIZE,
  TOURNAMENT_DIRECTORY_QUERY_LIMIT,
} from "../../../packages/lib/tournament-read";

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("public tournament slugs are normalized and invalid values are rejected", () => {
  assert.equal(normalizePublicTournamentSlug("  Heartland-Midwest-Classic-2026  "), "heartland-midwest-classic-2026");
  assert.equal(normalizePublicTournamentSlug(""), null);
  assert.equal(normalizePublicTournamentSlug("../admin"), null);
  assert.equal(normalizePublicTournamentSlug("two--dashes"), "two--dashes");
  assert.equal(normalizePublicTournamentSlug(`a${"b".repeat(240)}`), null);
});

test("directory pagination is bounded to 50 visible plus one lookahead row", () => {
  assert.equal(TOURNAMENT_DIRECTORY_PAGE_SIZE, 50);
  assert.equal(TOURNAMENT_DIRECTORY_QUERY_LIMIT, 51);
  assert.equal(normalizeTournamentDirectoryPage(undefined), 1);
  assert.equal(normalizeTournamentDirectoryPage("-4"), 1);
  assert.equal(normalizeTournamentDirectoryPage("9"), 9);
  assert.equal(normalizeTournamentDirectoryPage("999999"), 100);
  assert.equal(normalizeTournamentDirectoryPage("invalid"), 1);
});

for (const [app, helperPath, pagePath, getter, keyPrefix] of [
  [
    "TI",
    "apps/ti-web/lib/publicTournament.ts",
    "apps/ti-web/app/tournaments/[slug]/page.tsx",
    "getTiPublicTournament",
    "ti:public-tournament-by-slug:",
  ],
  [
    "RI",
    "apps/referee/lib/publicTournament.ts",
    "apps/referee/app/tournaments/[slug]/page.tsx",
    "getRiPublicTournament",
    "ri:public-tournament-by-slug:",
  ],
] as const) {
  test(`${app} public detail loader caches only validated successful records`, () => {
    const source = read(helperPath);
    assert.match(source, /import "server-only"/);
    assert.match(source, /unstable_cache/);
    assert.match(source, /60 \* 60/);
    assert.match(source, new RegExp(keyPrefix));
    assert.match(source, /throw new PublicTournamentNotFoundError\(\)/);
    assert.match(source, /returned an invalid row shape/);
    assert.match(source, /if \(!slug\) return \{ status: "not_found" \}/);
    assert.match(source, /requestCache\(async \(value: string\)/);
    assert.doesNotMatch(source, /director_email|director_phone|referee_contact_email|referee_contact_phone/);
  });

  test(`${app} metadata and page reuse the same request-facing loader`, () => {
    const source = read(pagePath);
    assert.match(source, new RegExp(`import \\{ ${getter} \\}`));
    assert.equal(source.match(new RegExp(`await ${getter}\\(params\\.slug\\)`, "g"))?.length, 2);
    assert.doesNotMatch(source, /\.from\("tournaments_public"/);
    assert.match(source, /status === "unavailable"/);
    assert.match(source, /status === "not_found"/);
  });
}

test("TI diagnostic detail fields match the shared public loader", () => {
  const loader = read("apps/ti-web/lib/publicTournament.ts");
  const diagnostic = read("scripts/analysis/tournaments_public_read_path_diagnostic.sql");
  for (const field of [
    "id",
    "slug",
    "name",
    "latitude",
    "longitude",
    "summary",
    "static_map_path",
    "static_map_status",
    "static_map_updated_at",
  ]) {
    assert.match(loader, new RegExp(`\\b${field}\\b`));
    assert.match(diagnostic, new RegExp(`\\b${field}\\b`));
  }
});

for (const [app, helperPath, pagePath] of [
  ["TI", "apps/ti-web/lib/tournamentDirectory.ts", "apps/ti-web/app/tournaments/page.tsx"],
  ["RI", "apps/referee/lib/tournamentDirectory.ts", "apps/referee/app/tournaments/page.tsx"],
] as const) {
  test(`${app} directory uses a five-minute controlled cache and bounded stable query`, () => {
    const helper = read(helperPath);
    const page = read(pagePath);
    assert.match(helper, /5 \* 60/);
    assert.match(helper, /TOURNAMENT_DIRECTORY_QUERY_LIMIT/);
    assert.match(helper, /\.order\("start_date"/);
    assert.match(helper, /\.order\("id"/);
    assert.match(helper, /\.range\(offset, offset \+ TOURNAMENT_DIRECTORY_QUERY_LIMIT - 1\)/);
    assert.match(helper, /normalized\.page <= MAX_CACHED_PAGE/);
    assert.match(helper, /!normalized\.q/);
    assert.match(helper, /query = query\.in\("state"/);
    assert.match(helper, /query = query\.in\("sport"/);
    assert.doesNotMatch(page, /while \(true\)/);
    assert.match(page, /Tournament directory pagination/);
    assert.match(page, /buildPageHref\(currentPage \+ 1\)/);
  });
}

test("TI radius requests enforce the same 51-row database limit", () => {
  const source = read("apps/ti-web/lib/tournamentDirectory.ts");
  assert.match(source, /list_tournaments_public_within_radius_v1/);
  assert.match(source, /p_limit: TOURNAMENT_DIRECTORY_QUERY_LIMIT/);
  assert.match(source, /p_offset: offset/);
  assert.match(source, /!normalized\.radius/);
});

test("TI directory heatmap aggregation uses the shared five-minute cache", () => {
  const helper = read("apps/ti-web/lib/tournamentDirectory.ts");
  const page = read("apps/ti-web/app/tournaments/page.tsx");
  assert.match(helper, /get_public_directory_tournament_counts_by_state_sport/);
  assert.match(helper, /TI_TOURNAMENT_DIRECTORY_COUNTS_CACHE_TAG/);
  assert.match(page, /getTiDirectoryHeatmapCounts/);
  assert.doesNotMatch(page, /get_public_directory_tournament_counts_by_state_sport/);
});

test("safe diagnostic plans do not execute application queries", () => {
  const source = read("scripts/analysis/tournaments_public_read_path_diagnostic.sql");
  const activeSql = source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(activeSql, /explain\s*\([^)]*analyze/i);
  assert.doesNotMatch(activeSql, /\b(insert|update|delete|alter|drop|truncate|vacuum)\b/i);
  assert.match(activeSql, /explain \(costs, verbose, settings, format text\)/i);
  assert.match(activeSql, /limit 51/i);
});

test("executing plans are isolated behind read-only low-traffic safeguards", () => {
  const source = read("scripts/analysis/tournaments_public_read_path_low_traffic_explain.sql");
  assert.match(source, /LOW-TRAFFIC OR STAGING ONLY/);
  assert.match(source, /begin read only/);
  assert.match(source, /set local statement_timeout = '10s'/);
  assert.match(source, /set local lock_timeout = '2s'/);
  assert.match(source, /explain \(analyze, buffers, settings, format text\)/);
  assert.match(source, /rollback/);
  assert.doesNotMatch(source, /\b(insert|update|delete|alter|drop|truncate|vacuum)\b/i);
});
