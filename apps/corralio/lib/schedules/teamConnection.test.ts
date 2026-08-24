import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync(new URL("../../app/actions.ts", import.meta.url), "utf8");
const familyUi = readFileSync(new URL("../../app/components/FamilySection.tsx", import.meta.url), "utf8");
const store = readFileSync(new URL("./supabaseStore.ts", import.meta.url), "utf8");

const teamConnectionAction = actions.slice(
  actions.indexOf("export async function connectTeamSchedule"),
  actions.indexOf("export async function createChild"),
);

test("team schedule connection resolves active family context on the server", () => {
  assert.match(teamConnectionAction, /getOwnerContext\(\)/);
  assert.match(teamConnectionAction, /\.from\("corralio_teams"\)/);
  assert.match(teamConnectionAction, /\.eq\("household_id", householdId\)/);
  assert.match(teamConnectionAction, /\.is\("archived_at", null\)/);
  assert.match(teamConnectionAction, /assignment: \{ childId: team\.child_id, teamId: team\.id \}/);
  assert.doesNotMatch(familyUi, /name="householdId"|name="childId"[^>]*team-schedule/i);
});

test("the edit-team panel accepts a resettable private URL without rendering it back", () => {
  assert.match(familyUi, /<summary className="familyTeamSummary"[^>]*aria-label=\{`Edit team:/);
  assert.match(familyUi, /className="familyTeamName">\{team\.displayName\}<\/span>/);
  assert.match(familyUi, />Calendar link<\/label>/);
  assert.match(familyUi, /iCal or ICS subscription link/);
  assert.match(familyUi, /Connect team schedule/);
  assert.match(familyUi, /name="sourceUrl"/);
  assert.match(familyUi, /type="url"/);
  assert.match(familyUi, /scheduleFormRef\.current\?\.reset\(\)/);
  assert.doesNotMatch(familyUi, /sourceUrl:\s*string|defaultValue=\{[^}]*sourceUrl|value=\{[^}]*sourceUrl/);
});

test("canonical source creation receives the server-validated assignment", () => {
  assert.match(store, /p_child_id: input\.childId/);
  assert.match(store, /p_team_id: input\.teamId/);
  assert.doesNotMatch(teamConnectionAction, /console\.(?:log|warn|error)|source_url/);
});
