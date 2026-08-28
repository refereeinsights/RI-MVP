import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getSchedulePlatform,
  getSchedulePlatformsForContext,
  isSchedulePlatformAllowed,
  SCHEDULE_PLATFORMS,
} from "./platforms";
import { connectTeamScheduleWithDependencies } from "./teamConnection";

const actions = readFileSync(new URL("../../app/actions.ts", import.meta.url), "utf8");
const householdPicker = readFileSync(
  new URL("../../app/components/ConnectScheduleForm.tsx", import.meta.url),
  "utf8",
);
const teamPicker = readFileSync(
  new URL("../../app/components/FamilySection.tsx", import.meta.url),
  "utf8",
);
const platformHelp = readFileSync(
  new URL("../../app/components/SchedulePlatformHelp.tsx", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../../../../supabase/migrations/20260828_corralio_schedule_connection_ux_unification.sql", import.meta.url),
  "utf8",
);
const catalogVerifier = readFileSync(
  new URL("../../../../scripts/analysis/corralio_schedule_connection_ux_catalog_verification.sql", import.meta.url),
  "utf8",
);
const behavioralVerifier = readFileSync(
  new URL("../../../../scripts/analysis/corralio_schedule_connection_ux_behavioral_verification.sql", import.meta.url),
  "utf8",
);

test("the canonical catalog implements the exact founder-approved context matrix", () => {
  assert.deepEqual(getSchedulePlatformsForContext("team").map(({ key }) => key), [
    "gamechanger", "teamsnap", "stack_team_app", "arbiterlive", "leagueapps", "other",
  ]);
  assert.deepEqual(getSchedulePlatformsForContext("household").map(({ key }) => key), [
    "gamechanger", "teamsnap", "stack_team_app", "arbiterlive", "arbiter_officials", "leagueapps", "other",
  ]);
  assert.equal(isSchedulePlatformAllowed("team", "arbiter_officials"), false);
  assert.equal(isSchedulePlatformAllowed("household", "arbiter_officials"), true);
  assert.equal(isSchedulePlatformAllowed("household", "leagueapps"), true);
  for (const platform of SCHEDULE_PLATFORMS) assert.equal(Array.isArray(platform.contexts), true);
});

test("LeagueApps remains documented-compatible with exact honest guidance", () => {
  const leagueApps = getSchedulePlatform("leagueapps");
  assert.equal(leagueApps.tier, "COMPATIBLE");
  assert.equal(
    leagueApps.caveat,
    "If a LeagueApps game is rescheduled, its calendar feed may contain both the old game marked RESCHEDULED and the new game. Corralio hasn’t yet verified how that appears here, so double-check important changes directly in LeagueApps.",
  );
  assert.equal(
    leagueApps.officialSupportUrl,
    "https://support.leagueapps.com/hc/en-us/articles/360039381354-Calendar-Sync",
  );
  assert.doesNotMatch(JSON.stringify(leagueApps), /DIRECT_INTEGRATION|VERIFIED/);
});

test("official support links are static public HTTPS metadata with safe external treatment", () => {
  for (const platform of SCHEDULE_PLATFORMS) {
    if (!platform.officialSupportUrl) continue;
    const url = new URL(platform.officialSupportUrl);
    assert.equal(url.protocol, "https:");
    assert.equal(url.username, "");
    assert.equal(url.password, "");
  }
  assert.match(platformHelp, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(platformHelp, /sourceUrl|formData|user input/i);
});

test("both flat pickers derive eligibility from the canonical catalog", () => {
  assert.match(householdPicker, /getSchedulePlatformsForContext\("household"\)/);
  assert.match(teamPicker, /getSchedulePlatformsForContext\("team"\)/);
  assert.match(householdPicker, /HOUSEHOLD_SCHEDULE_PLATFORMS\.map/);
  assert.match(teamPicker, /TEAM_SCHEDULE_PLATFORMS\.map/);
  assert.doesNotMatch(`${householdPicker}\n${teamPicker}`, /Common schedule apps|More schedule apps|search schedule/i);
});

test("both Server Actions enforce the shared context rule", () => {
  const householdAction = actions.slice(
    actions.indexOf("export async function connectSchedule"),
    actions.indexOf("export async function updateScheduleSport"),
  );
  const teamAction = actions.slice(
    actions.indexOf("export async function connectTeamSchedule"),
    actions.indexOf("export async function createChild"),
  );
  assert.match(householdAction, /isSchedulePlatformAllowed\("household", platform\)/);
  assert.match(teamAction, /connectTeamScheduleWithDependencies/);
  assert.match(teamAction, /isSchedulePlatformAllowed\("team", platform\)/);
});

test("a manipulated Officials team submission is rejected before lookup, fetch, or persistence", async () => {
  let teamLookups = 0;
  let ingestions = 0;
  const result = await connectTeamScheduleWithDependencies(
    {
      resolveTeam: async () => {
        teamLookups += 1;
        return null;
      },
      ingest: async () => {
        ingestions += 1;
        return { ok: true, sourceId: "unused", imported: 1 };
      },
    },
    {
      teamId: "c3800000-0000-4000-8000-000000000011",
      sourceUrl: "https://example.invalid/fixture.ics",
      platform: "arbiter_officials",
    },
  );
  assert.deepEqual(result, { ok: false, error: "Choose where this team schedule lives." });
  assert.equal(teamLookups, 0);
  assert.equal(ingestions, 0);
});

test("LeagueApps is accepted through deterministic team orchestration", async () => {
  let teamLookups = 0;
  let ingestions = 0;
  const result = await connectTeamScheduleWithDependencies(
    {
      resolveTeam: async (teamId) => {
        teamLookups += 1;
        return {
          id: teamId,
          childId: "c3800000-0000-4000-8000-000000000012",
          displayName: "Fixture team",
          sport: "soccer",
        };
      },
      ingest: async (input) => {
        ingestions += 1;
        assert.equal(input.assignment.teamId, "c3800000-0000-4000-8000-000000000011");
        return { ok: true, sourceId: "fixture-source", imported: 2 };
      },
    },
    {
      teamId: "c3800000-0000-4000-8000-000000000011",
      sourceUrl: "https://example.invalid/fixture.ics",
      platform: "leagueapps",
    },
  );
  assert.deepEqual(result, { ok: true, imported: 2 });
  assert.equal(teamLookups, 1);
  assert.equal(ingestions, 1);
});

test("the migration and verifiers keep measurement vocabulary closed", () => {
  assert.match(migration, /drop constraint corralio_schedule_connection_events_platform_check/);
  assert.match(migration, /'leagueapps'/);
  assert.doesNotMatch(migration, /create table|add column|create function|event_name|reason text/i);
  assert.match(catalogVerifier, /count\(\*\)[\s\S]*<> 7/);
  assert.match(behavioralVerifier, /begin;[\s\S]*rollback;/);
  assert.match(behavioralVerifier, /'unapproved_platform'/);
  assert.match(behavioralVerifier, /when check_violation/);
  assert.match(behavioralVerifier, /ROLLBACK CLEANUP ZERO/);
});
