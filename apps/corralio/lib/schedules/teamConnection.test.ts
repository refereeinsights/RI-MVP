import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync(new URL("../../app/actions.ts", import.meta.url), "utf8");
const familyUi = readFileSync(new URL("../../app/components/FamilySection.tsx", import.meta.url), "utf8");
const teamOrchestration = readFileSync(new URL("./teamConnection.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("./supabaseStore.ts", import.meta.url), "utf8");
const repairMigration = readFileSync(
  new URL("../../../../supabase/migrations/20260828_corralio_team_schedule_connection_fix.sql", import.meta.url),
  "utf8",
);
const catalogVerifier = readFileSync(
  new URL("../../../../scripts/analysis/corralio_slice46_catalog_verification.sql", import.meta.url),
  "utf8",
);
const behavioralVerifier = readFileSync(
  new URL("../../../../scripts/analysis/corralio_slice46_behavioral_verification.sql", import.meta.url),
  "utf8",
);

const teamConnectionAction = actions.slice(
  actions.indexOf("export async function connectTeamSchedule"),
  actions.indexOf("export async function createChild"),
);

test("team schedule connection resolves active family context on the server", () => {
  assert.match(teamConnectionAction, /getOwnerContext\(\)/);
  assert.match(teamConnectionAction, /\.from\("corralio_teams"\)/);
  assert.match(teamConnectionAction, /\.eq\("household_id", householdId\)/);
  assert.match(teamConnectionAction, /\.is\("archived_at", null\)/);
  assert.match(teamConnectionAction, /connectTeamScheduleWithDependencies/);
  assert.match(teamOrchestration, /assignment: \{ childId: team\.childId, teamId: team\.id \}/);
  assert.doesNotMatch(familyUi, /name="householdId"|name="childId"[^>]*team-schedule/i);
});

test("the edit-team panel accepts a resettable private URL without rendering it back", () => {
  assert.match(familyUi, /<summary className="familyTeamSummary"[^>]*aria-label=\{`Edit team:/);
  assert.match(familyUi, /className="familyTeamName">\{team\.displayName\}<\/span>/);
  assert.match(familyUi, /Where does this team schedule live\?/);
  assert.match(familyUi, />Paste calendar link<\/label>/);
  assert.match(familyUi, /iCal, ICS, or calendar subscription link/);
  assert.match(familyUi, /Connect team schedule/);
  assert.match(familyUi, /name="sourceUrl"/);
  assert.match(familyUi, /type="url"/);
  assert.match(familyUi, /scheduleFormRef\.current\?\.reset\(\)/);
  assert.doesNotMatch(familyUi, /sourceUrl:\s*string|defaultValue=\{[^}]*sourceUrl|value=\{[^}]*sourceUrl/);
});

test("canonical source creation persists exactly one server-validated assignment", () => {
  assert.match(store, /p_child_id: input\.teamId \? null : input\.childId/);
  assert.match(store, /p_team_id: input\.teamId/);
  assert.doesNotMatch(teamConnectionAction, /console\.(?:log|warn|error)|source_url/);
});

test("team arrival editing has a narrow authenticated repair and database coverage", () => {
  assert.match(
    repairMigration,
    /grant update \(arrival_buffer_minutes\)[\s\S]*on table public\.corralio_teams to authenticated/,
  );
  assert.doesNotMatch(repairMigration, /grant update on table public\.corralio_teams/i);
  assert.match(
    catalogVerifier,
    /has_column_privilege\(\s*'authenticated',[\s\S]*'arrival_buffer_minutes',[\s\S]*'UPDATE'\s*\)/,
  );
  assert.match(behavioralVerifier, /set arrival_buffer_minutes = 50/);
  assert.match(behavioralVerifier, /Team-connected fixture/);
  assert.match(behavioralVerifier, /p_child_id => null/);
});
