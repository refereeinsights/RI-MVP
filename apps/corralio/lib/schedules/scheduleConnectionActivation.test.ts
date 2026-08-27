import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  recordScheduleConnectionInteraction,
  sanitizeScheduleConnectionInteraction,
  SCHEDULE_CONNECTION_ANALYTICS_FAILURE_LOG,
} from "./connectionAnalytics";
import {
  getSchedulePlatform,
  parseSchedulePlatform,
  SCHEDULE_PLATFORMS,
} from "./platforms";

const connectForm = readFileSync(new URL("../../app/components/ConnectScheduleForm.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../../app/actions.ts", import.meta.url), "utf8");
const ingest = readFileSync(new URL("./ingest.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../../supabase/migrations/20260827_corralio_slice34_schedule_connection_activation.sql", import.meta.url), "utf8");
const report = readFileSync(new URL("../../../../scripts/analysis/corralio_schedule_connection_activation_report.sql", import.meta.url), "utf8");

test("the launch catalog is exactly four typed choices with honest compatibility tiers", () => {
  assert.deepEqual(SCHEDULE_PLATFORMS.map(({ key }) => key), [
    "gamechanger", "teamsnap", "stack_team_app", "other",
  ]);
  assert.equal(getSchedulePlatform("gamechanger").tier, "COMPATIBLE");
  assert.equal(getSchedulePlatform("teamsnap").tier, "COMPATIBLE");
  assert.equal(getSchedulePlatform("stack_team_app").tier, "COMPATIBLE");
  assert.equal(getSchedulePlatform("other").tier, "MANUAL");
  assert.equal(parseSchedulePlatform("sportsengine"), null);
  assert.equal(parseSchedulePlatform("stack_team_app"), "stack_team_app");
  assert.doesNotMatch(JSON.stringify(SCHEDULE_PLATFORMS), /Blue Sombrero|DIRECT_INTEGRATION/);
});

test("the picker uses one catalog and preserves the existing secure ingestion boundary", () => {
  assert.match(connectForm, /SCHEDULE_PLATFORMS\.map/);
  assert.match(connectForm, /Where does this schedule live\?/);
  assert.match(connectForm, /name="platform" value=\{selectedPlatform\.key\}/);
  assert.match(actions, /parseSchedulePlatform\(formData\.get\("platform"\)\)/);
  assert.match(actions, /recordScheduleConnectionInteractionAction[\s\S]*getOwnerContext\(\)/);
  assert.match(ingest, /fetchIcsSchedule/);
  assert.match(ingest, /normalizeSubmittedScheduleUrl/);
  assert.doesNotMatch(connectForm, /source_type|trusted|overture|venue|fetch\(/i);
});

test("success and contextual recovery use closed safe state without a forced redirect", () => {
  assert.match(actions, /Schedule connected — we found \$\{result\.imported\} upcoming/);
  assert.match(connectForm, /Connect another schedule/);
  assert.match(connectForm, /See This Weekend/);
  assert.doesNotMatch(actions.slice(actions.indexOf("export async function connectSchedule"), actions.indexOf("export async function updateScheduleSport")), /redirect\(/);
  assert.match(ingest, /This looks like a private or local address, not a public calendar link\./);
  assert.match(ingest, /This link doesn’t appear to be an iCal\/ICS calendar\./);
  assert.match(connectForm, /RECOVERY_COPY/);
  assert.match(connectForm, /Choose another schedule source/);
  assert.match(connectForm, /scrollIntoView\(\{ block: "start" \}\)/);
  assert.match(connectForm, /state\.status === "error" && state\.message && !errorDismissed/);
});

test("interaction sanitization accepts only the closed event, platform, and reason vocabulary", () => {
  assert.deepEqual(sanitizeScheduleConnectionInteraction({
    event: "platform_selected", platform: "teamsnap",
  }), { event: "platform_selected", platform: "teamsnap", reason: null });
  assert.deepEqual(sanitizeScheduleConnectionInteraction({
    event: "feed_validation_failed", platform: "other", reason: "not_ics",
  }), { event: "feed_validation_failed", platform: "other", reason: "not_ics" });
  assert.equal(sanitizeScheduleConnectionInteraction({ event: "events_imported", platform: "teamsnap" }), null);
  assert.equal(sanitizeScheduleConnectionInteraction({ event: "platform_selected", platform: "arbitrary" }), null);
  assert.equal(sanitizeScheduleConnectionInteraction({ event: "platform_selected", platform: "teamsnap", reason: "not_ics" }), null);
});

test("measurement failure is constant, payload-free, and fail-open", async () => {
  const logs: string[] = [];
  await recordScheduleConnectionInteraction({
    callRpc: async () => { throw new Error("secret schedule URL"); },
    log: (message) => logs.push(message),
  }, { event: "platform_selected", platform: "gamechanger" });
  assert.deepEqual(logs, [SCHEDULE_CONNECTION_ANALYTICS_FAILURE_LOG]);
  assert.doesNotMatch(logs[0] ?? "", /url|gamechanger|secret/i);
});

test("the migration stores only bounded interactions and the report derives activation", () => {
  assert.match(migration, /force row level security/);
  assert.match(migration, /on conflict \(household_id, event_name, platform, reason, occurred_minute\) do nothing/);
  assert.doesNotMatch(migration, /source_url|feed_content|event_title|account_id/i);
  assert.doesNotMatch(migration, /events_imported|second_schedule_connected|weekend_viewed/);
  assert.match(report, /corralio_schedule_sources/);
  assert.match(report, /corralio_weekly_engagement/);
  assert.match(report, /active_schedule_count >= 2/);
  assert.doesNotMatch(report, /select\s+[^;]*source_url/i);
});
